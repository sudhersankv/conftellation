// npx tsx scripts/drop-conference.ts <conferenceId> — remove a mis-imported conference and everything only it owns
// (sessions, booths, PLANS/ATTENDS edges). People and companies shared with other conferences are kept.
import { config } from "dotenv";
config({ path: ".env.local" });
import { q } from "../lib/falkor";

const id = process.argv[2];
if (!id) { console.error("usage: npx tsx scripts/drop-conference.ts <conferenceId>"); process.exit(1); }

async function main() {
  const [c] = await q<{ name: string }>(`MATCH (c:Conference {id:$id}) RETURN c.name AS name`, { id });
  if (!c) { console.log("not found:", id); return; }
  await q(`MATCH (:Conference {id:$id})-[:HAS_SESSION]->(s:Session) OPTIONAL MATCH (s)<-[:AT]-(m:Moment) DETACH DELETE m, s`, { id });
  await q(`MATCH (:Conference {id:$id})-[:HAS_BOOTH]->(b:Booth) DETACH DELETE b`, { id });
  await q(`MATCH (p:Person) WHERE NOT (p)-[:SPEAKS_AT]->() AND NOT (p)<-[:IS]-() AND NOT ()-[:MET]->(p) AND p.source CONTAINS $id DETACH DELETE p`, { id });
  await q(`MATCH (c:Conference {id:$id}) DETACH DELETE c`, { id });
  console.log(`dropped ${id} (${c.name})`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(), 50));
