// npx tsx scripts/prewarm-kubecon.ts [url] [--no-enrich]
// Fetches + normalizes a conference and enriches its top sponsors into seed/raw/cache (no graph writes),
// so the live import runs from cache. Costs ≤ SCOUT_ENRICH_LIMIT Bright Data requests on a cold cache, 0 after.
import "../seed/env";
import { requestsUsed } from "@/lib/brightdata";
import { buildNormalized } from "@/lib/agents/scout";
import { enrichSponsors, topSponsors } from "@/lib/agents/scout/enrich";

const KUBECON = "https://events.linuxfoundation.org/kubecon-cloudnativecon-north-america/";

async function main() {
  const url = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? KUBECON;
  const t0 = Date.now();
  const { norm, path } = await buildNormalized(url);
  const c = norm.conference;
  console.log(`${path}: ${c.id} "${c.name}" ${c.startDate}..${c.endDate} ${c.city ?? ""} ${c.timezone ?? ""}`);
  console.log(`sessions=${norm.sessions.length} speakers=${new Set(norm.sessions.flatMap((s) => s.speakers.map((p) => p.name))).size} sponsors=${norm.companies.length} (${Date.now() - t0} ms)`);
  console.log(`first session: ${norm.sessions[0]?.start} ${norm.sessions[0]?.title} [${norm.sessions[0]?.topics.join(", ")}]`);
  if (process.argv.includes("--no-enrich")) return;
  const limit = Number(process.env.SCOUT_ENRICH_LIMIT ?? 22);
  console.log(`enriching top ${limit}: ${topSponsors(norm.companies, limit).map((s) => s.name).join(", ")}`);
  const t1 = Date.now();
  const r = await enrichSponsors(norm.companies, { limit });
  console.log(`enriched=${r.enriched} failed=${r.failed.length} (${Date.now() - t1} ms)`);
  r.failed.forEach((f) => console.log(`  ! ${f}`));
  topSponsors(norm.companies, limit).forEach((s) => console.log(`  ${s.sponsorTier} ${s.name}: ${s.description ?? "-"} [${s.topics.join(", ")}]`));
  console.log(`Bright Data requests this run: ${requestsUsed()}`);
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
