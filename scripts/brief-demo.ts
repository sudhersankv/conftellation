// npx tsx scripts/brief-demo.ts [user] [confId] [--llm]: print the Recapper facts, brief and trip report (read-only: does not store).
import "../seed/env";
import { gatherFacts, writeBrief, writeTrip } from "@/lib/agents/recapper";

async function main() {
  const [user = "sam", conf = "ptc-2026"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!process.argv.includes("--llm")) delete process.env.OPENAI_API_KEY;
  const t0 = Date.now();
  const input = await gatherFacts(user, conf);
  console.log(`facts: ${input?.facts.length ?? "user not found"} (${Date.now() - t0} ms)`);
  for (const f of input?.facts ?? []) console.log(`  ${f.path.id} [${f.section}] ${f.path.text}\n      ${f.path.nodes.map((n) => `${n.label}:${n.id}`).join(" · ")}  (${f.path.edges.length} edges)`);
  if (!input) process.exit(0);
  const t1 = Date.now();
  const brief = await writeBrief(input);
  console.log(`\nbrief (${Date.now() - t1} ms):`);
  for (const s of brief.sections) console.log(`## ${s.title}\n${s.lines.map((l) => `  - ${l.text} [${l.pathId}]`).join("\n")}`);
  const t2 = Date.now();
  const trip = await writeTrip(input);
  console.log(`\ntrip (${Date.now() - t2} ms):\n${trip.markdown}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
