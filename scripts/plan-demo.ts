// npx tsx scripts/plan-demo.ts [userId] [now] [--write]: print the plan for a user on the demo graph.
import "../seed/env";
import { runPlanner } from "@/lib/agents/planner";

async function main() {
  const [userId = "sam", now = "2026-10-24T12:30:00-07:00"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const t0 = Date.now();
  const { plan, diff } = await runPlanner(userId, "ptc-2026", { now, write: process.argv.includes("--write") });
  console.log(`planned in ${Date.now() - t0} ms · now=${JSON.stringify(plan.now)}`);
  console.log("\nITINERARY");
  for (const s of plan.itinerary) console.log(`${s.from.slice(11, 16)}–${s.to.slice(11, 16)}  [${s.item.type}/${s.item.status}] ${s.item.title} (${s.item.score})  · ${s.item.why[0]?.text ?? ""}`);
  console.log("\nBY GOAL");
  for (const g of plan.byGoal) {
    console.log(`- ${g.goal.text} (w=${g.goal.weight})`);
    for (const k of ["sessions", "people", "booths"] as const) console.log(`    ${k}: ${g[k].map((i) => `${i.title} ${i.score}${i.status === "done" ? "✓" : ""}`).join(" | ")}`);
  }
  for (const g of plan.byGoal) for (const p of g.people) console.log(`  why ${p.title}: ${p.why.map((w) => w.text).join(" / ")}`);
  console.log("\nDIFF", JSON.stringify({ added: diff.added.length, removed: diff.removed.length, moved: diff.moved.length }));
  const items = [...plan.itinerary.map((s) => s.item), ...plan.byGoal.flatMap((g) => [...g.sessions, ...g.people, ...g.booths])];
  for (const i of items) {
    for (const w of i.why) if (w.text.length > 110) console.log(`LONG why (${w.text.length}) ${i.id}: ${w.text}`);
    if ((i.type === "session" && !i.session) || (i.type === "person" && !i.person) || (i.type === "booth" && !i.booth)) console.log(`MISSING detail ${i.type} ${i.id}`);
  }
  console.log("people userId:", [...new Set(plan.byGoal.flatMap((g) => g.people).map((p) => `${p.id}=${p.person?.userId ?? "-"}`))].join(", "));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
