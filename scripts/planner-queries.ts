// npx tsx scripts/planner-queries.ts: run the planner's candidate queries for Sam on the demo graph.
import "../seed/env";
import { boothPaths, personPaths, sessionPaths, sessionSimilarity, userState } from "@/lib/queries/plan";

async function main() {
  const [u, s, sim, p, b] = await Promise.all([
    userState("sam", "ptc-2026"), sessionPaths("sam", "ptc-2026"), sessionSimilarity("sam", "ptc-2026"),
    personPaths("sam", "ptc-2026"), boothPaths("sam", "ptc-2026"),
  ]);
  console.log("state:", JSON.stringify({ ...u, prevPlans: u?.prevPlans.length }, null, 0));
  console.log(`\nsessionPaths ${s.length}:`, s.map((r) => `${r.goalId}→${r.topicId}→${r.sessionId}`).join(" | "));
  console.log(`\nsimilarity ${sim.length}:`, sim.slice(0, 6).map((r) => `${r.goalId}:${r.sessionId}=${r.sim.toFixed(2)}`).join(" "));
  console.log(`\npersonPaths ${p.length}:`, p.map((r) => `${r.via}:${r.personId}(${r.goalId ?? r.conferenceName})`).join(" | "));
  console.log(`\nboothPaths ${b.length}:`, b.map((r) => `${r.sourceId}→${r.boothId}${r.metPersonId ? ` met ${r.metPersonId}` : ""}`).join(" | "));
  console.log("\nexample why (booth+met):", JSON.stringify(b.find((r) => r.metPersonId)));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
