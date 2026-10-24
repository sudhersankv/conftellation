// npx tsx scripts/crowd-demo.ts [sessionId] [--llm]: print a session's community view and crowd summary (read-only: does not store).
import "../seed/env";
import { hotMoments, writeCrowd } from "@/lib/agents/recapper/crowd";
import { sessionMoments, sessionMomentTimes } from "@/lib/queries/community";

async function main() {
  const [sessionId = "s-graphrag"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!process.argv.includes("--llm")) delete process.env.OPENAI_API_KEY;
  const shared = await sessionMoments(sessionId, { shared: true });
  console.log(`shared notes (${shared.length}):`);
  for (const m of shared) console.log(`  ${m.id} ${m.at} ${m.author}: ${m.text}`);
  console.log("hot moments:", hotMoments(await sessionMomentTimes(sessionId)));
  const t0 = Date.now();
  const crowd = await writeCrowd(sessionId, shared);
  console.log(`crowd (${Date.now() - t0} ms):`, crowd);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
