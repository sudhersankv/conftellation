// npm run seed [-- --no-ghu]
// Wipes FALKORDB_GRAPH, creates indexes, loads PTC + AI Engineer Summit (June) + GitHub Universe, then the personal layer.
import "./env";
import { embedderName } from "@/lib/llm";
import { seedDemo } from "./demo";

async function main() {
  const t0 = Date.now();
  console.log(`graph=${process.env.FALKORDB_GRAPH} embedder=${embedderName()}`);
  await seedDemo({ githubUniverse: !process.argv.includes("--no-ghu"), log: (s) => console.log(`  ${s}`) });
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
