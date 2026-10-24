// npx tsx scripts/catalog.ts [--dry] [--enrich] [--only=<id>]
// Builds the conference catalogue in FALKORDB_GRAPH from real public schedule feeds (sched .ics / Sessionize; 0 Bright Data
// credits unless --enrich). Same pipeline as importConference (buildNormalized -> upsertConference), plus an id/name
// override: LF pages title themselves "Schedule | <Event>", which would otherwise import as "Schedule" / schedule-2026.
// Idempotent: everything MERGEs on id; a conference already in the graph (by id or url) is skipped.
import "../seed/env";
import { requestsUsed } from "@/lib/brightdata";
import { q } from "@/lib/falkor";
import { ensureIndexes } from "@/lib/schema";
import { buildNormalized } from "@/lib/agents/scout";
import { enrichSponsors } from "@/lib/agents/scout/enrich";
import { upsertConference } from "@/lib/agents/scout/upsert";
import { conferenceByUrl, conferenceCounts } from "@/lib/queries/conferences";
import type { NormalizedConference, NormPerson } from "@/lib/agents/scout/normalized";

interface Entry { url: string; id: string; name: string; city?: string }

export const CATALOG: Entry[] = [
  { url: "https://kccnceu2026.sched.com/", id: "kubecon-cloudnativecon-europe-2026", name: "KubeCon + CloudNativeCon Europe 2026", city: "Amsterdam" },
  { url: "https://kccncna2025.sched.com/", id: "kubecon-cloudnativecon-north-america-2025", name: "KubeCon + CloudNativeCon North America 2025", city: "Atlanta" },
  { url: "https://events.linuxfoundation.org/pytorch-conference/program/schedule/", id: "pytorch-conference-2026", name: "PyTorch Conference North America 2026", city: "San Jose" },
  { url: "https://ossjapan2026.sched.com/", id: "open-source-summit-japan-2026", name: "Open Source Summit Japan 2026", city: "Tokyo" },
];

/**
 * sched .ics feeds carry speakers only in the title: "Talk - Name, Role, Company & Name2, Company2" (or "; " between people).
 * Split them off so the conference has real speakers (SPEAKS_AT), which the demo users then MET.
 */
export function schedSpeakers(norm: NormalizedConference): number {
  let n = 0;
  for (const s of norm.sessions) {
    if (s.speakers.length) continue;
    const title = s.title.replace(/\\,/g, ",");
    const cut = title.lastIndexOf(" - ");
    if (cut < 8) continue;
    const people = title.slice(cut + 3).split(/\s*(?:&|;)\s*/).map((chunk): NormPerson | null => {
      const parts = chunk.split(/,\s*/).map((x) => x.trim()).filter(Boolean);
      const name = parts[0] ?? "";
      if (!/^\p{Lu}[\p{L}'.-]*(?:\s+[\p{L}'.-]+){1,3}$/u.test(name) || parts.length < 2) return null;
      return { name, company: parts[parts.length - 1], title: parts.length > 2 ? parts.slice(1, -1).join(", ") : undefined };
    });
    if (!people.length || people.some((p) => !p)) continue;
    s.title = title.slice(0, cut).trim();
    s.speakers = people as NormPerson[];
    n += people.length;
  }
  return n;
}

/** schedule-2026 was imported from the LF "Schedule | AgntCon + MCPCon" page before this override existed. */
async function fixAgntCon() {
  if (process.argv.includes("--dry")) return;
  const [c] = await q<{ name: string }>(
    `MATCH (c:Conference {id:'schedule-2026'})
     SET c.name = 'AgntCon + MCPCon North America 2026', c.url = 'https://events.linuxfoundation.org/agntcon-mcpcon-north-america',
         c.city = coalesce(c.city, 'San Francisco')
     RETURN c.name AS name`,
  );
  // Junk topics scraped from the page chrome.
  const [t] = await q<{ n: number }>(
    `MATCH (t:Topic) WHERE t.id IN ['mcpcon','agntcon','schedule','agenda','sessions','speakers','program'] WITH collect(t) AS ts
     FOREACH (x IN ts | DETACH DELETE x) RETURN size(ts) AS n`,
  );
  if (c) console.log(`schedule-2026 -> "${c.name}", junk topics deleted=${t?.n ?? 0}`);
}

async function main() {
  await fixAgntCon();
  const dry = process.argv.includes("--dry");
  const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
  for (const e of CATALOG.filter((x) => !only || x.id === only)) {
    const t0 = Date.now();
    const bd0 = requestsUsed();
    const [byId] = await q<{ id: string }>(`MATCH (c:Conference {id:$id}) RETURN c.id AS id`, { id: e.id });
    const hit = byId ? null : await conferenceByUrl([e.url]);
    const existing = byId?.id ?? hit?.id;
    if (!dry && existing) {
      console.log(`skip ${existing}: already in the graph ${JSON.stringify(await conferenceCounts(existing))}`);
      continue;
    }
    const { norm, path } = await buildNormalized(e.url);
    const scraped = norm.conference.name;
    if (path === "ics") schedSpeakers(norm);
    norm.conference.id = e.id;
    norm.conference.name = e.name;
    if (!norm.conference.city && e.city) norm.conference.city = e.city;
    const c = norm.conference;
    const speakers = new Set(norm.sessions.flatMap((s) => s.speakers.map((p) => p.name))).size;
    console.log(`${path}: ${c.id} "${c.name}" (scraped "${scraped}") ${c.startDate}..${c.endDate} ${c.city ?? "-"} ${c.timezone ?? "-"} sessions=${norm.sessions.length} speakers=${speakers} sponsors=${norm.companies.length}${existing ? ` [exists as ${existing}]` : ""}`);
    if (dry) continue;
    if (process.argv.includes("--enrich") && norm.companies.length) {
      const r = await enrichSponsors(norm.companies, { context: c.name, limit: 5 });
      console.log(`  sponsors enriched=${r.enriched} failed=${r.failed.length}`);
    }
    await ensureIndexes();
    const r = await upsertConference(norm);
    console.log(`  wrote ${JSON.stringify(r.counts)} in ${Date.now() - t0} ms, Bright Data requests=${requestsUsed() - bd0}`);
  }
  console.log(`Bright Data requests this run: ${requestsUsed()}`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
