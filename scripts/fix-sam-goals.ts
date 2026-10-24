// npx tsx scripts/fix-sam-goals.ts [--apply] — list Sam's goals/problems; with --apply, delete duplicates
// (anything that is not one of the seeded ids) together with their ABOUT edges and the PLANS edges that cite them.
import { config } from "dotenv";
config({ path: ".env.local" });
import { q } from "../lib/falkor";

const KEEP_GOALS = ["g-tracing", "g-infra", "g-role"];
const KEEP_PROBLEMS = ["pr-tracing"];
const apply = process.argv.includes("--apply");

async function main() {
  const goals = await q<{ id: string; text: string; weight: number; plans: number }>(
    `MATCH (u:User {id:"sam"})-[:HAS_GOAL]->(g:Goal)
     OPTIONAL MATCH (u)-[p:PLANS]->() WHERE p.goalId = g.id
     RETURN g.id AS id, g.text AS text, g.weight AS weight, count(p) AS plans ORDER BY g.id`,
  );
  const problems = await q<{ id: string; text: string }>(`MATCH (u:User {id:"sam"})-[:HAS_PROBLEM]->(p:Problem) RETURN p.id AS id, p.text AS text`);
  console.log("goals:", JSON.stringify(goals, null, 0));
  console.log("problems:", JSON.stringify(problems));
  const dropGoals = goals.map((g) => g.id).filter((id) => !KEEP_GOALS.includes(id));
  const dropProblems = problems.map((p) => p.id).filter((id) => !KEEP_PROBLEMS.includes(id));
  console.log("would drop goals:", dropGoals, "problems:", dropProblems);
  if (!apply) return;
  if (dropGoals.length) {
    await q(`MATCH (u:User {id:"sam"})-[p:PLANS]->() WHERE p.goalId IN $ids DELETE p`, { ids: dropGoals });
    await q(`MATCH (u:User {id:"sam"})-[:HAS_GOAL]->(g:Goal) WHERE g.id IN $ids DETACH DELETE g`, { ids: dropGoals });
  }
  if (dropProblems.length) await q(`MATCH (u:User {id:"sam"})-[:HAS_PROBLEM]->(p:Problem) WHERE p.id IN $ids DETACH DELETE p`, { ids: dropProblems });
  const after = await q<{ id: string }>(`MATCH (u:User {id:"sam"})-[:HAS_GOAL]->(g:Goal) RETURN g.id AS id`);
  console.log("after:", after.map((g) => g.id));
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => setTimeout(() => process.exit(), 50));
