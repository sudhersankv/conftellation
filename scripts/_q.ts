import "../seed/env";
import { q } from "@/lib/falkor";
async function main() {
  const conf = process.argv[2];
  const re = process.argv[3] ?? "agent,trac,observab,inference";
  const rows = await q(
    `MATCH (c:Conference {id:$conf})-[:HAS_SESSION]->(s:Session) WHERE any(w IN $ws WHERE toLower(s.title) CONTAINS w)
     OPTIONAL MATCH (p:Person)-[:SPEAKS_AT]->(s)
     RETURN s.id AS id, s.start AS start, s.end AS end, s.title AS title, collect(p.id)[0..2] AS sp ORDER BY start LIMIT 60`,
    { conf, ws: re.split(",") },
  );
  for (const r of rows as any[]) console.log(`${r.start} ${r.end?.slice(11, 16)} ${r.id} | ${r.title.slice(0, 80)} | ${r.sp.join(",")}`);
  const [c] = await q(`MATCH (c:Conference {id:$conf}) RETURN c.name AS name, c.startDate AS s, c.endDate AS e, c.timezone AS tz`, { conf });
  console.log(JSON.stringify(c));
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
