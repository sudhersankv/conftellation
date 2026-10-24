// npx tsx scripts/purge-test-users.ts — remove throwaway users (ids ui-* / smoke-*) and their personal layer
// from the demo graph, then print Sam's demo state and all meet requests.
import { config } from "dotenv";
config({ path: ".env.local" });
import { q } from "../lib/falkor";

async function main() {
  const before = await q<{ id: string }>(`MATCH (u:User) WHERE u.id STARTS WITH "ui-" OR u.id STARTS WITH "smoke-" RETURN u.id AS id`);
  await q(
    `MATCH (u:User) WHERE u.id STARTS WITH "ui-" OR u.id STARTS WITH "smoke-"
     OPTIONAL MATCH (u)-[:HAS_GOAL|HAS_PROBLEM|CAPTURED|STEERED|HAS_SUMMARY|IS|PLAN_MEETS]->(x)
     OPTIONAL MATCH (u)-[:ATTENDS]->(m:Meet)
     DETACH DELETE x, m, u`,
  );
  const meets = await q<{ from: string; to: string; status: string; note: string }>(
    `MATCH (a:User)-[r:REQUESTED_MEET]->(b:User) RETURN a.id AS from, b.id AS to, r.status AS status, r.note AS note`,
  );
  const [sam] = await q<{ plans: number; moments: number; summaries: number }>(
    `MATCH (u:User {id:"sam"})
     OPTIONAL MATCH (u)-[p:PLANS]->() WITH u, count(p) AS plans
     OPTIONAL MATCH (u)-[:CAPTURED]->(m) WITH u, plans, count(m) AS moments
     OPTIONAL MATCH (u)-[:HAS_SUMMARY]->(s) RETURN plans, moments, count(s) AS summaries`,
  );
  console.log("purged:", before.map((b) => b.id).join(", ") || "none");
  console.log("meet requests:", JSON.stringify(meets));
  console.log("sam:", JSON.stringify(sam));
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => setTimeout(() => process.exit(), 50));
