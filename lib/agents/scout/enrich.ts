// Sponsor enrichment: the sponsor's own homepage via Bright Data Web Unlocker (SERP snippets if the page comes back empty)
// → LLM → "what they do" + topics. Results are memoized next to the scrape cache, so a pre-warmed import costs no credits and no LLM calls.
import { z } from "zod";
import { memo, serp, unlock } from "@/lib/brightdata";
import { hasLLM, structured } from "@/lib/llm";
import type { Via } from "@/lib/types";
import type { NormCompany } from "./normalized";
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

/** Top sponsors by tier, in listing order within a tier. */
export function topSponsors(companies: NormCompany[], limit: number): NormCompany[] {
  return companies
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.website)
    .sort((a, b) => tierRank(a.c.sponsorTier) - tierRank(b.c.sponsorTier) || a.i - b.i)
    .slice(0, limit)
    .map(({ c }) => c);
}

export interface EnrichResult { enriched: number; failed: string[] }

/** Mutates the top `limit` companies in place: description, topics, provenance (via "unlocker" or "serp"). */
export async function enrichSponsors(companies: NormCompany[], opts: { limit?: number; concurrency?: number } = {}): Promise<EnrichResult> {
  const limit = opts.limit ?? Number(process.env.SCOUT_ENRICH_LIMIT ?? 22);
  const picked = topSponsors(companies, limit);
  const failed: string[] = [];
  let enriched = 0;
  await mapLimit(picked, opts.concurrency ?? 6, async (c) => {
    try {
      const url = c.website!;
      const r = await memo({ v: 2, task: "sponsor-enrich", url }, url, async () => {
        if (!hasLLM()) throw new Error("no LLM");
        const page = await unlock(url);
        let text = page.data.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\n{3,}/g, "\n\n").slice(0, 12_000);
        let src: { source: string; collectedAt: string; via: Via } = { source: url, collectedAt: page.collectedAt, via: "unlocker" };
        if (text.trim().length < MIN_PAGE) {
          const s = await serp(`${c.name} ${new URL(url).hostname}`);
          text = s.data.slice(0, 8).map((x) => `- ${x.title}: ${x.description ?? ""} (${x.link})`).join("\n");
          src = { source: s.source, collectedAt: s.collectedAt, via: "serp" };
        }
        if (text.trim().length < 100) throw new Error("no usable content");
        const out = await structured(Extract, SYSTEM, `Company: ${c.name}\nURL: ${url}\n\n${text}`, "sponsor");
        if (!out.known || !out.description) throw new Error("content doesn't say what they do");
        return { description: out.description, topics: out.topics, ...src };
      });
      c.description = r.data.description;
      c.topics = [...new Set([...c.topics, ...r.data.topics.map((t) => t.toLowerCase().trim()).filter(Boolean)])].slice(0, 6);
      c.provenance = { source: r.data.source, collectedAt: r.data.collectedAt, via: r.data.via };
      enriched++;
    } catch (e) {
      failed.push(`${c.name}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160));
    }
  });
  return { enriched, failed };
}
