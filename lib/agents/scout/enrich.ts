// Sponsor enrichment: the sponsor's own homepage via Bright Data Web Unlocker (SERP snippets if the page comes back empty)
// → LLM → "what they do" + topics. Results are memoized next to the scrape cache, so a pre-warmed import costs no credits and no LLM calls.
import { z } from "zod";
import { memo, serp, unlock, type SerpResult } from "@/lib/brightdata";
import { hasLLM, structured } from "@/lib/llm";
import { assertResolvedPublic, publicUrlProblem, UnsafeUrlError } from "@/lib/publicUrl";
import type { Via } from "@/lib/types";
import { companyId, type NormCompany } from "./normalized";
import { mapLimit } from "./upsert";

const TIER_RANK = [/diamond/i, /platinum/i, /gold/i, /silver/i, /bronze/i, /start-?up/i, /end user/i];
const tierRank = (t?: string) => {
  const i = TIER_RANK.findIndex((re) => re.test(t ?? ""));
  return i < 0 ? TIER_RANK.length : i;
};

const Extract = z.object({
  known: z.boolean(),
  description: z.string(),
  topics: z.array(z.string()),
});

const SYSTEM = `You read public web content about a company (its homepage as markdown, or search result snippets) and describe it for a conference attendee.
Return:
- known: false if the content does not say what the company sells or builds (empty, error page, cookie wall). Then leave the rest empty.
- description: 1-2 plain sentences on what the company sells or builds and for whom. No marketing adjectives, nothing that isn't in the content.
- topics: 3-5 short lowercase technical topics it offers, 1-3 words each (e.g. "kubernetes security", "observability", "ai inference").`;

const MIN_PAGE = 500;

/** Top sponsors by tier, in listing order within a tier. Name-only sponsors stay in the list so they can be searched. */
export function topSponsors(companies: NormCompany[], limit: number): NormCompany[] {
  return companies
    .map((c, i) => ({ c, i }))
    .sort((a, b) => tierRank(a.c.sponsorTier) - tierRank(b.c.sponsorTier) || a.i - b.i)
    .slice(0, limit)
    .map(({ c }) => c);
}

export interface EnrichResult {
  enriched: number;
  failed: string[];
  skipped: { name: string; reason: string }[];
}

const AGGREGATORS = ["linkedin.com", "wikipedia.org", "wikidata.org", "crunchbase.com", "facebook.com", "fb.com", "twitter.com", "x.com", "instagram.com", "youtube.com", "medium.com", "bloomberg.com", "pitchbook.com", "zoominfo.com", "glassdoor.com", "yelp.com", "google.com", "bing.com", "duckduckgo.com", "reddit.com", "github.com", "fandom.com"];
const NAME_STOP = new Set(["inc", "llc", "ltd", "corp", "the", "and", "co", "company", "gmbh", "plc"]);

const publicLink = (link: string) => {
  try {
    return publicUrlProblem(link) ? undefined : link;
  } catch {
    return undefined;
  }
};

const hostOf = (link: string) => {
  try {
    return new URL(link).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

const isAggregator = (host: string) => AGGREGATORS.some((d) => host === d || host.endsWith(`.${d}`));

/** A result counts only when its host looks like this company, not an aggregator or the conference site. */
function hostMatchesCompany(name: string, link: string, conferenceHost?: string): boolean {
  const host = hostOf(link);
  if (!host || isAggregator(host)) return false;
  const conf = conferenceHost?.replace(/^www\./, "").toLowerCase();
  if (conf && (host === conf || host.endsWith(`.${conf}`) || conf.endsWith(`.${host}`))) return false;
  const tokens = name.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !NAME_STOP.has(t));
  return tokens.some((t) => host.split(".")[0] === t || host.includes(t));
}

async function searchWebsite(c: NormCompany, context?: string, conferenceHost?: string): Promise<{ url: string; snippets: string; source: string; collectedAt: string } | { skip: string }> {
  const query = [c.name, context, "official website"].filter(Boolean).join(" ").replace(/\s+/g, " ");
  let results: { data: SerpResult[]; source: string; collectedAt: string };
  try {
    results = await serp(query);
  } catch (e) {
    return { skip: `no website; search failed: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160) };
  }
  const usable = results.data.filter((r) => publicLink(r.link));
  const match = usable.find((r) => hostMatchesCompany(c.name, r.link, conferenceHost));
  if (!match) return { skip: usable.length ? "no website; search returned no result for this company" : "no website; search returned no public url" };
  const snippets = results.data.slice(0, 8).map((x) => `- ${x.title}: ${x.description ?? ""} (${x.link})`).join("\n");
  return { url: match.link, snippets, source: results.source, collectedAt: results.collectedAt };
}

function skip(c: NormCompany, reason: string, skipped: EnrichResult["skipped"]) {
  c.website = c.website && !publicUrlProblem(c.website) ? c.website : undefined;
  c.enrichSkip = reason;
  skipped.push({ name: c.name, reason });
}

/** Mutates the top `limit` companies in place: description, topics, provenance (via "unlocker" or "serp"). */
export async function enrichSponsors(companies: NormCompany[], opts: { limit?: number; concurrency?: number; context?: string; conferenceHost?: string } = {}): Promise<EnrichResult> {
  const limit = opts.limit ?? Number(process.env.SCOUT_ENRICH_LIMIT ?? 22);
  const picked = topSponsors(companies, limit);
  const failed: string[] = [];
  const skipped: EnrichResult["skipped"] = [];
  let enriched = 0;
  await mapLimit(picked, opts.concurrency ?? 6, async (c) => {
    try {
      let url = c.website?.trim() || undefined;
      let fallback = "";
      let fallbackSrc: { source: string; collectedAt: string; via: Via } | undefined;
      if (!url) {
        c.id ??= companyId(c.name, undefined);
        const found = await searchWebsite(c, opts.context, opts.conferenceHost);
        if ("skip" in found) return skip(c, found.skip, skipped);
        url = found.url;
        c.website = url;
        fallback = found.snippets;
        fallbackSrc = { source: found.source, collectedAt: found.collectedAt, via: "serp" };
      }
      if (publicUrlProblem(url)) return skip(c, "website is not a public http(s) url", skipped);
      try {
        await assertResolvedPublic(url);
      } catch (e) {
        if (e instanceof UnsafeUrlError) return skip(c, "website host is not public", skipped);
        throw e;
      }
      const pageUrl = url;
      const r = await memo({ v: 2, task: "sponsor-enrich", url: pageUrl }, pageUrl, async () => {
        if (!hasLLM()) throw new Error("no LLM");
        const page = await unlock(pageUrl);
        let text = page.data.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\n{3,}/g, "\n\n").slice(0, 12_000);
        let src: { source: string; collectedAt: string; via: Via } = { source: pageUrl, collectedAt: page.collectedAt, via: "unlocker" };
        if (text.trim().length < MIN_PAGE) {
          if (fallback.trim().length >= 100 && fallbackSrc) {
            text = fallback;
            src = fallbackSrc;
          } else {
            const s = await serp(`${c.name} ${new URL(pageUrl).hostname}`);
            text = s.data.slice(0, 8).map((x) => `- ${x.title}: ${x.description ?? ""} (${x.link})`).join("\n");
            src = { source: s.source, collectedAt: s.collectedAt, via: "serp" };
          }
        }
        if (text.trim().length < 100) throw new Error("no usable content");
        const out = await structured(Extract, SYSTEM, `Company: ${c.name}\nURL: ${pageUrl}\n\n${text}`, "sponsor");
        if (!out.known || !out.description) throw new Error("content doesn't say what they do");
        return { description: out.description, topics: out.topics, ...src };
      });
      c.description = r.data.description;
      c.topics = [...new Set([...c.topics, ...r.data.topics.map((t) => t.toLowerCase().trim()).filter(Boolean)])].slice(0, 6);
      c.provenance = { source: r.data.source, collectedAt: r.data.collectedAt, via: r.data.via };
      c.enrichSkip = undefined;
      enriched++;
    } catch (e) {
      failed.push(`${c.name}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160));
    }
  });
  return { enriched, failed, skipped };
}
