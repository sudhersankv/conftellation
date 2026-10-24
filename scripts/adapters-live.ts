// npx tsx scripts/adapters-live.ts: one real call per adapter (costs: 1 LLM call, ≤1 Bright Data credit; cached after).
import "../seed/env";
import { z } from "zod";
import { structured } from "@/lib/llm";
import { requestsUsed, unlock } from "@/lib/brightdata";

async function main() {
  const t0 = Date.now();
  const out = await structured(
    z.object({ ops: z.array(z.object({ op: z.enum(["set_window", "reweight_goal"]), to: z.string().nullable(), goal: z.string().nullable(), weight: z.number().nullable() })) }),
    "Turn the attendee's steer text into ops. Today is 2026-10-24, timezone -07:00.",
    "leaving at 3pm, less hiring stuff",
  );
  console.log(`structured (${process.env.OPENAI_MODEL}, ${Date.now() - t0} ms):`, JSON.stringify(out));

  const t1 = Date.now();
  const page = await unlock("https://example.com");
  console.log(`unlock (${Date.now() - t1} ms, cached=${page.cached}, credits this run=${requestsUsed()}):`, page.data.slice(0, 200).replace(/\s+/g, " "));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
