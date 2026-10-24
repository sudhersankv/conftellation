// npm run inspect: sanity queries against the seeded demo graph.
import "../seed/env";
import { q } from "@/lib/falkor";
import { embedOne } from "@/lib/llm";

async function main() {
  const show = async (title: string, cypher: string, params: Record<string, unknown> = {}) => {
    console.log(`\n## ${title}`);
    console.table(await q(cypher, params));
  };
  await show("labels", `MATCH (n) RETURN labels(n)[0] AS label, count(*) AS n ORDER BY n DESC`);
  await show("Q1 sessions for g-tracing", `
    MATCH (u:User {id:'sam'})-[:HAS_GOAL]->(g:Goal {id:'g-tracing'})-[:ABOUT]->(t:Topic)
    MATCH (c:Conference {id:'ptc-2026'})-[:HAS_SESSION]->(s:Session)-[:ABOUT]->(t)
    RETURN s.id AS id, s.title AS title, s.start AS start, count(DISTINCT t) AS overlap ORDER BY overlap DESC, start`);
  await show("vector: 'agent tracing' over all sessions", `
    CALL db.idx.vector.queryNodes('Session','embedding',6,vecf32($v)) YIELD node, score
    RETURN node.id AS id, node.title AS title, node.conferenceId AS conf, score`, { v: await embedOne("debugging why AI agents fail: tracing and observability") });
  await show("Q6 met before at ptc", `
    MATCH (c:Conference {id:'ptc-2026'})-[:HAS_SESSION]->(s:Session)<-[:SPEAKS_AT]-(p:Person)
    MATCH (u:User {id:'sam'})-[m:MET]->(p) WHERE m.conferenceId <> 'ptc-2026'
    RETURN p.name AS person, m.conferenceId AS metAt, s.title AS speaksAt`);
  await show("Jake across conferences", `MATCH (p:Person {id:'jake-morales@falkordb'})-[:SPEAKS_AT]->(s)<-[:HAS_SESSION]-(c) RETURN c.id AS conf, s.title AS title`);
  await show("company dupes by name", `MATCH (co:Company) WITH toLower(co.name) AS n, collect(co.id) AS ids WHERE size(ids) > 1 RETURN n, ids`);
  await show("topics (ptc)", `MATCH (:Conference {id:'ptc-2026'})-[:HAS_SESSION]->(:Session)-[:ABOUT]->(t:Topic) RETURN t.id AS id, count(*) AS n ORDER BY n DESC`);
  await show("topics missing embedding", `MATCH (t:Topic) WHERE t.embedding IS NULL RETURN t.id AS id`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
