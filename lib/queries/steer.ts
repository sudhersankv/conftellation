// Steer: resolve free-text matches to node ids (lexical, then vector) and persist ops as the edges/properties the Planner reads.
import { q } from "@/lib/falkor";
import { embedOne } from "@/lib/llm";
import type { TargetKind } from "@/lib/types";

/** Vector matches farther than this cosine distance are ignored. */
const MAX_DIST = 0.5;

export interface ConfTopic { id: string; name: string }

/** Topics used by the conference's sessions or booth companies. */
export async function conferenceTopics(confId: string): Promise<ConfTopic[]> {
  return q<ConfTopic>(
    `MATCH (:Conference {id:$confId})-[:HAS_SESSION]->(:Session)-[:ABOUT]->(t:Topic) RETURN DISTINCT t.id AS id, coalesce(t.name, t.id) AS name
     UNION
     MATCH (:Conference {id:$confId})-[:HAS_BOOTH]->(:Booth)<-[:HAS_BOOTH]-(:Company)-[:OFFERS]->(t:Topic) RETURN DISTINCT t.id AS id, coalesce(t.name, t.id) AS name`,
    { confId },
  );
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const stem = (w: string) => (w.length > 4 ? w.replace(/(ing|ers|er|es|s)$/, "") : w);
const STOP = new Set("a an the of for to and on in at with about my our more less some any talks talk sessions session stuff".split(" "));
const words = (s: string) => norm(s).split(" ").filter((w) => w && !STOP.has(w)).map(stem);

/** True if every meaningful word of `needle` appears in `hay` (stemmed). */
export function lexicalMatch(needle: string, hay: string): boolean {
  const n = words(needle), h = new Set(words(hay));
  return n.length > 0 && n.every((w) => h.has(w) || [...h].some((x) => x.startsWith(w) && w.length >= 4));
}

/** Topics a free text is about: lexical hits on conference topics, else nearest by vector (≤ MAX_DIST). */
export async function topicsForText(text: string, confId: string, limit = 3): Promise<string[]> {
  const topics = await conferenceTopics(confId);
  const lex = topics.filter((t) => lexicalMatch(t.name, text) || lexicalMatch(text, t.name)).map((t) => t.id);
  if (lex.length) return lex.slice(0, limit);
  const allowed = new Set(topics.map((t) => t.id));
  const rows = await q<{ id: string; score: number }>(
    `CALL db.idx.vector.queryNodes('Topic', 'embedding', 20, vecf32($v)) YIELD node, score RETURN node.id AS id, score ORDER BY score`,
    { v: await embedOne(text) },
  ).catch(() => []);
  return rows.filter((r) => allowed.has(r.id) && r.score <= MAX_DIST).slice(0, limit).map((r) => r.id);
}

/** Resolve `match` to node ids of one kind at the conference. Lexical first; vector fallback for sessions/people/booths. */
export async function resolveMatch(kind: TargetKind, match: string, confId: string): Promise<string[]> {
  if (!match.trim()) return [];
  if (kind === "topic") return topicsForText(match, confId);
  const lists = {
    session: () => q<{ id: string; name: string }>(
      `MATCH (:Conference {id:$confId})-[:HAS_SESSION]->(s:Session) OPTIONAL MATCH (s)-[:ABOUT]->(t:Topic)
       WITH s, collect(t.id) AS ts RETURN s.id AS id, s.title + ' ' + reduce(acc = '', x IN ts | acc + ' ' + x) AS name`, { confId }),
    person: () => q<{ id: string; name: string }>(
      `MATCH (:Conference {id:$confId})-[:HAS_SESSION]->(:Session)<-[:SPEAKS_AT]-(p:Person) RETURN DISTINCT p.id AS id, p.name AS name
       UNION
       MATCH (:Conference {id:$confId})<-[:ATTENDS]-(:User)-[:IS]->(p:Person) RETURN DISTINCT p.id AS id, p.name AS name`, { confId }),
    booth: () => q<{ id: string; name: string }>(
      `MATCH (:Conference {id:$confId})-[:HAS_BOOTH]->(b:Booth)<-[:HAS_BOOTH]-(co:Company) RETURN b.id AS id, co.name + ' ' + b.label AS name`, { confId }),
  };
  const all = await lists[kind]();
  const lex = all.filter((r) => r.name && lexicalMatch(match, r.name)).map((r) => r.id);
  if (lex.length) return lex.slice(0, 5);
  const label = kind === "session" ? "Session" : kind === "person" ? "Person" : "Company";
  const allowed = new Set(all.map((r) => r.id));
  const rows = await q<{ id: string; score: number }>(
    kind === "booth"
      ? `CALL db.idx.vector.queryNodes('Company', 'embedding', 10, vecf32($v)) YIELD node, score
         MATCH (node)-[:HAS_BOOTH]->(b:Booth) RETURN b.id AS id, score ORDER BY score`
      : `CALL db.idx.vector.queryNodes('${label}', 'embedding', 10, vecf32($v)) YIELD node, score RETURN node.id AS id, score ORDER BY score`,
    { v: await embedOne(match) },
  ).catch(() => []);
  return rows.filter((r) => allowed.has(r.id) && r.score <= MAX_DIST).slice(0, 1).map((r) => r.id);
}

// ---------- writes ----------

export async function setWindow(userId: string, from: string | null, to: string | null) {
  await q(`MATCH (u:User {id:$userId}) SET u.availFrom = $from, u.availTo = $to`, { userId, from, to });
}

export async function setBlocks(userId: string, blocks: { from: string; to: string; label: string }[]) {
  await q(`MATCH (u:User {id:$userId}) SET u.blocks = $blocks`, { userId, blocks: JSON.stringify(blocks) });
}

export async function setBoothMinutes(userId: string, minutes: number | null) {
  await q(`MATCH (u:User {id:$userId}) SET u.boothMinutes = $minutes`, { userId, minutes });
}

export async function setGoalWeight(userId: string, goalId: string, weight: number) {
  await q(`MATCH (:User {id:$userId})-[:HAS_GOAL]->(g:Goal {id:$goalId}) SET g.weight = $weight`, { userId, goalId, weight });
}

export async function removeGoal(userId: string, goalId: string) {
  await q(`MATCH (:User {id:$userId})-[:HAS_GOAL]->(g:Goal {id:$goalId}) DETACH DELETE g`, { userId, goalId });
}

/** MERGE a goal on id, link its topics, store its embedding. */
export async function upsertGoal(userId: string, g: { id: string; text: string; kind: string; weight: number; topics: string[] }) {
  await q(
    `MATCH (u:User {id:$userId}) MERGE (g:Goal {id:$id}) SET g.text = $text, g.kind = $kind, g.weight = $weight, g.embedding = vecf32($v)
     MERGE (u)-[:HAS_GOAL]->(g)
     WITH g UNWIND $topics AS tid MATCH (t:Topic {id:tid}) MERGE (g)-[:ABOUT]->(t)`,
    { userId, ...g, v: await embedOne(`${g.text}. Topics: ${g.topics.join(", ")}`) },
  );
}

export async function upsertProblem(userId: string, p: { id: string; text: string; topics: string[] }) {
  await q(
    `MATCH (u:User {id:$userId}) MERGE (p:Problem {id:$id}) SET p.text = $text, p.embedding = vecf32($v)
     MERGE (u)-[:HAS_PROBLEM]->(p)
     WITH p UNWIND $topics AS tid MATCH (t:Topic {id:tid}) MERGE (p)-[:ABOUT]->(t)`,
    { userId, ...p, v: await embedOne(`${p.text}. Topics: ${p.topics.join(", ")}`) },
  );
}

/** SKIPPED / BOOSTED (pinned) edges; the opposite edge is removed. */
export async function markTargets(userId: string, ids: string[], kind: "skip" | "boost" | "pin") {
  const [add, drop] = kind === "skip" ? ["SKIPPED", "BOOSTED"] : ["BOOSTED", "SKIPPED"];
  await q(
    `MATCH (u:User {id:$userId}) UNWIND $ids AS id
     MATCH (x {id:id}) WHERE x:Session OR x:Booth OR x:Person OR x:Topic
     OPTIONAL MATCH (u)-[old:${drop}]->(x) DELETE old
     MERGE (u)-[r:${add}]->(x) SET r.at = $at, r.pinned = $pinned`,
    { userId, ids, at: new Date().toISOString(), pinned: kind === "pin" },
  );
}

/** Undo for exclude/boost/pin: drop both steering edges. */
export async function clearTargets(userId: string, ids: string[]) {
  await q(`MATCH (:User {id:$userId})-[r:SKIPPED|BOOSTED]->(x) WHERE x.id IN $ids DELETE r`, { userId, ids });
}

/** Current SKIPPED/BOOSTED state of targets, so undo can restore it. */
export async function targetMarks(userId: string, ids: string[]): Promise<{ id: string; type: string; pinned: boolean }[]> {
  if (!ids.length) return [];
  return q(
    `MATCH (:User {id:$userId})-[r:SKIPPED|BOOSTED]->(x) WHERE x.id IN $ids RETURN x.id AS id, type(r) AS type, coalesce(r.pinned, false) AS pinned`,
    { userId, ids },
  );
}

export async function targetExists(id: string): Promise<boolean> {
  return (await q(`MATCH (x {id:$id}) WHERE x:Session OR x:Booth OR x:Person RETURN x.id AS id LIMIT 1`, { id })).length > 0;
}

export async function storeSteer(userId: string, s: { id: string; text: string; ops: unknown[]; at: string }) {
  await q(
    `MATCH (u:User {id:$userId}) MERGE (s:Steer {id:$id}) SET s.text = $text, s.ops = $ops, s.at = $at MERGE (u)-[:STEERED]->(s)`,
    { userId, id: s.id, text: s.text, ops: JSON.stringify(s.ops), at: s.at },
  );
}
