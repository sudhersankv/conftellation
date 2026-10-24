// npx tsx scripts/queries-check.ts: run the spec §6 queries (Q1–Q11) against the demo graph and print compact results.
import "../seed/env";
import { q } from "@/lib/falkor";

const P = { userId: "sam", confId: "ptc-2026", goalId: "g-tracing" };

async function run(title: string, cypher: string, params: Record<string, unknown> = P) {
  const t0 = Date.now();
  try {
    const rows = await q(cypher, params);
    console.log(`\n## ${title}  (${rows.length} rows, ${Date.now() - t0} ms)`);
    if (rows.length) console.table(rows.slice(0, 12));
  } catch (e) {
    console.log(`\n## ${title}  ERROR: ${(e as Error).message}`);
  }
}

async function main() {
  await run("Q1 sessions for goal g-tracing", `
    MATCH (u:User {id:$userId})-[:HAS_GOAL]->(g:Goal {id:$goalId})-[:ABOUT]->(t:Topic)
    MATCH (c:Conference {id:$confId})-[:HAS_SESSION]->(s:Session)-[:ABOUT]->(t)
    RETURN s.id AS id, s.title AS title, s.start AS start, collect(DISTINCT t.id) AS topics, count(DISTINCT t) AS overlap
    ORDER BY overlap DESC, start ASC LIMIT 12`);

  await run("Q1b vector union: goal embedding → sessions at conf", `
    MATCH (g:Goal {id:$goalId})
    CALL db.idx.vector.queryNodes('Session','embedding',30, g.embedding) YIELD node, score
    MATCH (:Conference {id:$confId})-[:HAS_SESSION]->(node)
    RETURN node.id AS id, node.title AS title, round(1000*(1-score))/1000 AS sim ORDER BY sim DESC LIMIT 6`);

  await run("Q2 people for goal g-infra (speakers on goal topics + sponsor staff)", `
    MATCH (u:User {id:$userId})-[:HAS_GOAL]->(:Goal {id:'g-infra'})-[:ABOUT]->(t:Topic)
    MATCH (c:Conference {id:$confId})-[:HAS_SESSION]->(s:Session)-[:ABOUT]->(t)
    MATCH (p:Person)-[:SPEAKS_AT]->(s)
    RETURN p.id AS person, 'speaks: ' + s.title AS via, t.id AS topic
    UNION
    MATCH (u:User {id:$userId})-[:HAS_GOAL]->(:Goal {id:'g-infra'})-[:ABOUT]->(t:Topic)
    MATCH (c:Conference {id:$confId})
    MATCH (t)<-[:OFFERS]-(co:Company)-[:SPONSORS]->(c)
    MATCH (p:Person)-[:WORKS_AT]->(co)
    RETURN p.id AS person, 'works at sponsor ' + co.name AS via, t.id AS topic`);

  await run("Q3 booths for Sam's problem (+ people he met there)", `
    MATCH (u:User {id:$userId})-[:HAS_PROBLEM]->(pr:Problem)-[:ABOUT]->(t:Topic)
    MATCH (co:Company)-[:OFFERS]->(t)
    MATCH (c:Conference {id:$confId})-[:HAS_BOOTH]->(b:Booth)<-[:HAS_BOOTH]-(co)
    OPTIONAL MATCH (u)-[:MET]->(p:Person)-[:WORKS_AT]->(co)
    RETURN b.id AS booth, b.label AS label, co.name AS company, collect(DISTINCT t.id) AS topics, collect(DISTINCT p.name) AS peopleYouMet
    ORDER BY size(peopleYouMet) DESC, size(topics) DESC`);

  await run("Q4 plan candidates with steering filters (no window set)", `
    MATCH (u:User {id:$userId})-[:HAS_GOAL]->(g:Goal)-[:ABOUT]->(t:Topic)
    MATCH (c:Conference {id:$confId})-[:HAS_SESSION]->(s:Session)-[:ABOUT]->(t)
    WHERE NOT (u)-[:SKIPPED]->(s) AND NOT (u)-[:SKIPPED]->(t)
      AND (u.availFrom IS NULL OR s.start >= u.availFrom)
      AND (u.availTo IS NULL OR s.end <= u.availTo)
    OPTIONAL MATCH (u)-[b:BOOSTED]->(s)
    WITH s, sum(DISTINCT g.weight) AS goalScore, count(b) AS boosted
    RETURN s.id AS id, s.start AS start, s.end AS end, goalScore, boosted ORDER BY goalScore DESC, start`);

  await run("Q5 warm intro (met a user → their session's speaker → speaks on my problem)", `
    MATCH (u:User {id:$userId})-[:MET]->(a:Person)<-[:IS]-(au:User)
    MATCH (au)-[:CAPTURED]->(:Moment)-[:AT]->(s:Session)<-[:SPEAKS_AT]-(b:Person)
    MATCH (b)-[:SPEAKS_AT]->(s2:Session)-[:ABOUT]->(t:Topic)<-[:ABOUT]-(:Problem)<-[:HAS_PROBLEM]-(u)
    WHERE NOT (u)-[:MET]->(b)
    RETURN DISTINCT a.name AS via, b.name AS intro, s.title AS sawAt, s2.title AS speaksOn, t.id AS topic LIMIT 5`);

  await run("Q6 met before, here today", `
    MATCH (c:Conference {id:$confId})-[:HAS_SESSION]->(s:Session)<-[:SPEAKS_AT]-(p:Person)
    MATCH (u:User {id:$userId})-[m:MET]->(p)
    WHERE m.conferenceId <> $confId
    MATCH (prev:Conference {id:m.conferenceId})
    RETURN p.name AS person, prev.name AS metAt, m.at AS when, collect(s.title) AS speaksToday`);

  await run("Q7 network overlap (other users at conf)", `
    MATCH (u:User {id:$userId})-[:PLANS|CAPTURED*1..2]->(x)<-[:PLANS|CAPTURED*1..2]-(o:User)-[:ATTENDS]->(:Conference {id:$confId})
    WHERE o <> u AND (x:Session OR x:Booth)
    RETURN o.id AS user, o.name AS name, collect(DISTINCT x.id) AS shared, count(DISTINCT x) AS overlap
    ORDER BY overlap DESC LIMIT 10`);

  await run("Q7b goal-topic overlap", `
    MATCH (u:User {id:$userId})-[:HAS_GOAL]->()-[:ABOUT]->(t:Topic)<-[:ABOUT]-(:Goal)<-[:HAS_GOAL]-(o:User)
    WHERE o <> u
    RETURN o.id AS user, collect(DISTINCT t.id) AS sharedTopics ORDER BY size(sharedTopics) DESC LIMIT 8`);

  await run("Q9 community: shared notes on s-graphrag", `
    MATCH (s:Session {id:'s-graphrag'})<-[:AT]-(m:Moment {shared:true})<-[:CAPTURED]-(u:User)
    RETURN m.id AS id, m.at AS at, u.name AS author, m.text AS text ORDER BY at`);

  await run("Q9b hot moments s-graphrag (raw times)", `
    MATCH (:Session {id:'s-graphrag'})<-[:AT]-(m:Moment) RETURN m.at AS at ORDER BY at`);

  await run("Q10 personal record", `
    MATCH (u:User {id:$userId})-[:ATTENDS]->(c:Conference)
    OPTIONAL MATCH (u)-[m:MET]->(p:Person) WHERE m.conferenceId = c.id
    OPTIONAL MATCH (u)-[:CAPTURED]->(mo:Moment)-[:DURING]->(c)
    RETURN c.id AS conf, c.startDate AS startDate, count(DISTINCT p) AS people, count(DISTINCT mo) AS moments
    ORDER BY startDate DESC`);

  await run("Q11 constellation: edge counts around Sam", `
    MATCH (u:User {id:$userId})
    OPTIONAL MATCH (u)-[:HAS_GOAL|HAS_PROBLEM]->(gp)-[:ABOUT]->(t:Topic)
    WITH u, count(DISTINCT gp) AS goalsProblems, count(DISTINCT t) AS topics
    OPTIONAL MATCH (u)-[:PLANS]->(pl)
    WITH u, goalsProblems, topics, count(pl) AS plans
    OPTIONAL MATCH (u)-[:CAPTURED]->(m:Moment)-[:AT|MET|MENTIONS]->(x)
    WITH u, goalsProblems, topics, plans, count(DISTINCT m) AS moments, count(DISTINCT x) AS momentTargets
    OPTIONAL MATCH (u)-[:MET]->(p:Person)
    RETURN goalsProblems, topics, plans, moments, momentTargets, count(DISTINCT p) AS met`);

  await run("Shortest path Sam → Jake (for intro highlight)", `
    MATCH (u:User {id:$userId}), (j:Person {id:'jake-morales@falkordb'})
    WITH shortestPath((u)-[*..4]->(j)) AS p
    RETURN [n IN nodes(p) | coalesce(n.name, n.title, n.text, n.id)] AS path, [r IN relationships(p) | type(r)] AS rels`);

  await run("Shortest path Sam → Priya (directed, for warm-intro highlight)", `
    MATCH (u:User {id:$userId}), (j:Person {id:'priya-nair@acmetrace'})
    WITH shortestPath((u)-[*..6]->(j)) AS p
    RETURN [n IN nodes(p) | coalesce(n.name, n.title, n.text, n.id)] AS path, [r IN relationships(p) | type(r)] AS rels`);

  await run("Shortest path Sam → Priya (undirected)", `
    MATCH (u:User {id:$userId}), (j:Person {id:'priya-nair@acmetrace'})
    WITH shortestPath((u)-[*..6]-(j)) AS p
    RETURN [n IN nodes(p) | coalesce(n.name, n.title, n.kind, n.id)] AS path, [r IN relationships(p) | type(r)] AS rels`);

  await run("Q5 as a named path → WhyPath nodes/edges", `
    MATCH p = (u:User {id:$userId})-[:MET]->(a:Person)<-[:IS]-(au:User)-[:CAPTURED]->(m:Moment)-[:AT]->(s:Session)<-[:SPEAKS_AT]-(b:Person)
    WHERE NOT (u)-[:MET]->(b)
    RETURN [n IN nodes(p) | {id:n.id, label:labels(n)[0], name:coalesce(n.name, n.title, n.kind)}] AS nodes,
           [r IN relationships(p) | {type:type(r), from:startNode(r).id, to:endNode(r).id}] AS edges LIMIT 1`);

  await run("Q7' network overlap incl. check-ins (PLANS or CAPTURED→Moment→AT)", `
    MATCH (u:User {id:$userId})-[:PLANS|CAPTURED|AT*1..2]->(x)<-[:PLANS|CAPTURED|AT*1..2]-(o:User)-[:ATTENDS]->(:Conference {id:$confId})
    WHERE o <> u AND (x:Session OR x:Booth)
    RETURN o.id AS user, collect(DISTINCT x.id) AS shared, count(DISTINCT x) AS overlap
    ORDER BY overlap DESC LIMIT 10`);

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
