// Graph indexes (spec §5.4). Idempotent: "already indexed" errors are ignored.
import { q } from "@/lib/falkor";
import { EMBED_DIM } from "@/lib/llm";

const RANGE: [string, string][] = [
  ["Conference", "id"], ["Conference", "url"], ["Session", "id"], ["Person", "id"], ["Company", "id"],
  ["Booth", "id"], ["Topic", "id"], ["User", "id"], ["Goal", "id"], ["Problem", "id"], ["Moment", "id"],
  ["Steer", "id"], ["Meet", "id"], ["Summary", "id"],
];
export const VECTOR_LABELS = ["Session", "Person", "Company", "Topic"] as const;

export async function ensureIndexes(): Promise<void> {
  for (const [label, prop] of RANGE) await tryIndex(`CREATE INDEX FOR (n:${label}) ON (n.${prop})`);
  for (const label of VECTOR_LABELS) {
    await tryIndex(
      `CREATE VECTOR INDEX FOR (n:${label}) ON (n.embedding) OPTIONS {dimension:${EMBED_DIM}, similarityFunction:'cosine'}`,
    );
  }
}

async function tryIndex(cypher: string) {
  try {
    await q(cypher);
  } catch (e) {
    if (!/already indexed|already exists/i.test(String(e))) throw e;
  }
}
