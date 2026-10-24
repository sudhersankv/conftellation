// npm run falkor:ping — checks the connection, parameters, and vector index support.
import { config } from "dotenv";
config({ path: ".env.local" });
import { db, q, vecf32 } from "../lib/falkor";

async function main() {
  const client = await db();
  console.log("graphs:", await client.list());
  const g = (process.env.FALKORDB_GRAPH ?? "conftellations") + "_ping";
  const graph = client.selectGraph(g);
  await graph.query("MERGE (n:Ping {id:$id}) SET n.at = $at", { params: { id: "x", at: new Date().toISOString() } });
  console.log("param query ok:", (await graph.query("MATCH (n:Ping) RETURN n.id AS id, n.at AS at")).data);
  try { await graph.query("CREATE VECTOR INDEX FOR (p:Ping) ON (p.emb) OPTIONS {dimension:3, similarityFunction:'cosine'}"); } catch (e) { console.log("index:", (e as Error).message); }
  await graph.query(`MATCH (n:Ping {id:'x'}) SET n.emb = ${vecf32([1, 0, 0])}`);
  await graph.query(`MERGE (n:Ping {id:'y'}) SET n.emb = ${vecf32([0, 1, 0])}`);
  const r = await graph.query(`CALL db.idx.vector.queryNodes('Ping','emb',2, ${vecf32([0.9, 0.1, 0])}) YIELD node, score RETURN node.id AS id, score`);
  console.log("vector inline:", r.data);
  try {
    const r2 = await graph.query("CALL db.idx.vector.queryNodes('Ping','emb',2, vecf32($v)) YIELD node, score RETURN node.id AS id, score", { params: { v: [0.9, 0.1, 0] } });
    console.log("vector param ok:", r2.data);
  } catch (e) { console.log("vector param FAILED:", (e as Error).message); }
  await graph.delete();
  await client.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
