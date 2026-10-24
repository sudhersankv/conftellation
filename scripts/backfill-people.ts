// npx tsx scripts/backfill-people.ts [--list] [--dry]
// One-off: conferences imported before Person.photoUrl/links were persisted. Re-reads each Sessionize / RainFocus public feed
// (plain HTTP through the brightdata cache: 0 Bright Data credits) and sets ONLY photoUrl and links on Person nodes that already
// exist, matched by the adapter identity rule (personId = slug(name)@companySlug). Creates nothing, touches no sessions.
import { config } from "dotenv";
config({ path: ".env.local" });
import { fetchJson } from "../lib/brightdata";
import { q } from "../lib/falkor";
import { RAINFOCUS_SITES, fetchRainFocus } from "../lib/agents/scout/adapters/rainfocus";
import { sessionizeToNormalized, type SessionizeAll } from "../lib/agents/scout/adapters/sessionize";
import { personId, type NormPerson, type NormalizedConference } from "../lib/agents/scout/normalized";

const dry = process.argv.includes("--dry");

type Conf = { id: string; name: string; url: string | null; source: string | null; via: string | null; timezone: string | null };

async function feed(c: Conf): Promise<NormalizedConference | string> {
  if (c.via === "rainfocus") {
    const site = RAINFOCUS_SITES.find((s) => s.conference.id === c.id);
    if (!site) return "no known RainFocus catalog ids for this conference";
    return fetchRainFocus(site, (u, init) => fetchJson(u, init));
  }
  if (c.via === "sessionize") {
    const code = c.source?.match(/sessionize\.com\/api\/v2\/([a-z0-9]+)\/view/i)?.[1];
    if (!code) return `source is not a Sessionize API feed (${c.source ?? "none"})`;
    const r = await fetchJson<SessionizeAll>(`https://sessionize.com/api/v2/${code}/view/All`);
    return sessionizeToNormalized({
      data: r.data, conference: { id: c.id, name: c.name, url: c.url ?? "", startDate: "", endDate: "" },
      source: c.source!, collectedAt: r.collectedAt, timeZone: c.timezone ?? "America/Los_Angeles", idPrefix: "backfill",
    });
  }
  return `via=${c.via ?? "none"} has no public speaker feed`;
}

async function main() {
  const confs = await q<Conf>(`MATCH (c:Conference) RETURN c.id AS id, c.name AS name, c.url AS url, c.source AS source, c.via AS via, c.timezone AS timezone ORDER BY id`);
  if (process.argv.includes("--list")) {
    for (const c of confs) console.log(`${c.id}\tvia=${c.via}\tsource=${c.source}`);
    return;
  }
  for (const c of confs.filter((x) => x.via === "sessionize" || x.via === "rainfocus")) {
    let norm: NormalizedConference | string;
    try {
      norm = await feed(c);
    } catch (e) {
      norm = `feed failed: ${e instanceof Error ? e.message : String(e)}`;
    }
    if (typeof norm === "string") {
      console.log(`${c.id}: skipped (${norm})`);
      continue;
    }
    // Same identity rule as upsertConference: p.id ?? personId(name, company).
    const byId = new Map<string, { photoUrl?: string; links?: string[] }>();
    const add = (p: NormPerson) => {
      const id = p.id ?? personId(p.name, p.company);
      const prev = byId.get(id) ?? {};
      byId.set(id, { photoUrl: prev.photoUrl ?? p.photoUrl, links: prev.links?.length ? prev.links : p.links?.filter(Boolean) });
    };
    norm.sessions.forEach((s) => s.speakers.forEach(add));
    norm.people?.forEach(add);
    const ids = [...byId.keys()];
    const rows = [...byId.entries()]
      .map(([id, v]) => ({ id, photoUrl: v.photoUrl ?? null, links: v.links?.length ? v.links : null }))
      .filter((r) => r.photoUrl || r.links);
    const [{ matched }] = await q<{ matched: number }>(`MATCH (p:Person) WHERE p.id IN $ids RETURN count(p) AS matched`, { ids });
    let updated = 0;
    if (!dry) {
      for (let i = 0; i < rows.length; i += 200) {
        const [r] = await q<{ n: number }>(
          `UNWIND $rows AS r
           MATCH (p:Person {id:r.id})
           SET p.photoUrl = coalesce(r.photoUrl, p.photoUrl), p.links = coalesce(r.links, p.links)
           RETURN count(p) AS n`,
          { rows: rows.slice(i, i + 200) },
        );
        updated += r?.n ?? 0;
      }
    }
    console.log(`${c.id}: feed people ${ids.length}, matched ${matched}, with photo/links ${rows.length}, updated ${dry ? "(dry run)" : updated}`);
  }
}

main().then(() => process.exit(0), (e) => {
  console.error(e);
  process.exit(1);
});
