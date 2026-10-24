// Planner inputs. Every candidate row carries a named path (nodes/edges) that becomes a WhyPath.
import { q } from "@/lib/falkor";
import type { EdgeType, NodeLabel } from "@/lib/types";

export interface PathNode { id: string; label: NodeLabel; name: string }
export interface PathEdge { from: string; to: string; type: EdgeType }
export interface RawPath { nodes: PathNode[]; edges: PathEdge[] }

export const PATH = (p: string) => `
  [n IN nodes(${p}) | {id:n.id, label:labels(n)[0], name:coalesce(n.name, n.title, n.text, n.label, n.id)}] AS nodes,
  [r IN relationships(${p}) | {from:startNode(r).id, to:endNode(r).id, type:type(r)}] AS edges`;

export interface UserState {
  goals: { id: string; text: string; kind: string; weight: number; topics: string[] }[];
  problems: { id: string; text: string; topics: string[] }[];
  personId: string | null;
  availFrom: string | null;
  availTo: string | null;
  boothMinutes: number | null;
  blocks: string | null; // JSON Block[]
  skipped: string[];
  boosted: { id: string; pinned: boolean }[];
  doneIds: string[]; // sessions/booths with a check-in or note today
  metToday: string[]; // person ids met at this conference
  checkins: { targetId: string; at: string }[];
  prevPlans: { id: string; slotStart: string | null; type: string; title: string }[];
}

/** Feedback edge `r` on `x` applies at $confId: unscoped (steer, legacy), scoped to it, or on a Topic (a global preference). */
const FEEDBACK_IN_CONF = (r: string, x: string) => `(${r}.conferenceId IS NULL OR ${r}.conferenceId = $confId OR ${x}:Topic)`;

export async function userState(userId: string, confId: string): Promise<UserState | null> {
  const [u] = await q<{ personId: string | null; availFrom: string | null; availTo: string | null; boothMinutes: number | null; blocks: string | null }>(
    `MATCH (u:User {id:$userId}) OPTIONAL MATCH (u)-[:IS]->(p:Person)
     RETURN p.id AS personId, u.availFrom AS availFrom, u.availTo AS availTo, u.boothMinutes AS boothMinutes, u.blocks AS blocks`,
    { userId },
  );
  if (!u) return null;
  const [goals, problems, skipped, boosted, done, met, checkins, prev] = await Promise.all([
    q<UserState["goals"][number]>(
      `MATCH (:User {id:$userId})-[:HAS_GOAL]->(g:Goal) OPTIONAL MATCH (g)-[:ABOUT]->(t:Topic)
       RETURN g.id AS id, g.text AS text, g.kind AS kind, coalesce(g.weight, 1.0) AS weight, collect(t.id) AS topics`,
      { userId },
    ),
    q<UserState["problems"][number]>(
      `MATCH (:User {id:$userId})-[:HAS_PROBLEM]->(p:Problem) OPTIONAL MATCH (p)-[:ABOUT]->(t:Topic)
       RETURN p.id AS id, p.text AS text, collect(t.id) AS topics`,
      { userId },
    ),
    q<{ id: string }>(`MATCH (:User {id:$userId})-[r:SKIPPED]->(x) WHERE ${FEEDBACK_IN_CONF("r", "x")} RETURN DISTINCT x.id AS id`, { userId, confId }),
    q<{ id: string; pinned: boolean }>(
      `MATCH (:User {id:$userId})-[b:BOOSTED]->(x) WHERE ${FEEDBACK_IN_CONF("b", "x")} RETURN x.id AS id, coalesce(b.pinned, false) AS pinned`,
      { userId, confId },
    ),
    q<{ id: string }>(
      `MATCH (:User {id:$userId})-[:CAPTURED]->(m:Moment)-[:AT]->(x) WHERE m.conferenceId = $confId RETURN DISTINCT x.id AS id`,
      { userId, confId },
    ),
    q<{ id: string }>(`MATCH (:User {id:$userId})-[r:MET]->(p:Person) WHERE r.conferenceId = $confId RETURN p.id AS id`, { userId, confId }),
    q<{ targetId: string; at: string }>(
      `MATCH (:User {id:$userId})-[:CAPTURED]->(m:Moment {kind:'checkin'})-[:AT]->(x) WHERE m.conferenceId = $confId
       RETURN x.id AS targetId, m.at AS at ORDER BY at DESC`,
      { userId, confId },
    ),
    q<UserState["prevPlans"][number]>(
      `MATCH (:User {id:$userId})-[r:PLANS]->(x) WHERE r.conferenceId = $confId
       RETURN x.id AS id, r.slotStart AS slotStart, labels(x)[0] AS type, coalesce(x.title, x.name, x.label) AS title`,
      { userId, confId },
    ),
  ]);
  return {
    ...u, goals, problems,
    skipped: skipped.map((r) => r.id),
    // one target can carry several boosts (one per conference, plus an unscoped steer pin): pinned if any is
    boosted: [...boosted.reduce((m, b) => m.set(b.id, { id: b.id, pinned: b.pinned || (m.get(b.id)?.pinned ?? false) }), new Map<string, { id: string; pinned: boolean }>()).values()],
    doneIds: done.map((r) => r.id), metToday: met.map((r) => r.id),
    checkins, prevPlans: prev,
  };
}

export interface SessionPathRow extends RawPath { goalId: string; sessionId: string; topicId: string }

/** Q1/Q4: sessions at the conference sharing a topic with a goal; skipped sessions/topics excluded. */
export async function sessionPaths(userId: string, confId: string): Promise<SessionPathRow[]> {
  return q<SessionPathRow>(
    `MATCH (u:User {id:$userId})-[:HAS_GOAL]->(g:Goal)
     MATCH p = (g)-[:ABOUT]->(t:Topic)<-[:ABOUT]-(s:Session)
     MATCH (:Conference {id:$confId})-[:HAS_SESSION]->(s)
     WHERE NOT (u)-[:SKIPPED]->(s) AND NOT (u)-[:SKIPPED]->(t)
     RETURN g.id AS goalId, s.id AS sessionId, t.id AS topicId, ${PATH("p")}`,
    { userId, confId },
  );
}

export interface BoostPathRow extends RawPath { sessionId: string; topicId: string }

/** Steer "more X": sessions about a topic the user BOOSTED. */
export async function boostedTopicPaths(userId: string, confId: string): Promise<BoostPathRow[]> {
  return q<BoostPathRow>(
    `MATCH p = (u:User {id:$userId})-[:BOOSTED]->(t:Topic)<-[:ABOUT]-(s:Session)
     MATCH (:Conference {id:$confId})-[:HAS_SESSION]->(s)
     WHERE NOT (u)-[:SKIPPED]->(s)
     RETURN s.id AS sessionId, t.id AS topicId, ${PATH("p")}`,
    { userId, confId },
  );
}

/** Vector similarity (1 - cosine distance) of each goal's embedding to sessions at the conference. */
export async function sessionSimilarity(userId: string, confId: string): Promise<{ goalId: string; sessionId: string; sim: number }[]> {
  return q(
    `MATCH (:User {id:$userId})-[:HAS_GOAL]->(g:Goal) WHERE g.embedding IS NOT NULL
     CALL db.idx.vector.queryNodes('Session', 'embedding', 60, g.embedding) YIELD node, score
     MATCH (:Conference {id:$confId})-[:HAS_SESSION]->(node)
     RETURN g.id AS goalId, node.id AS sessionId, 1 - score AS sim`,
    { userId, confId },
  );
}

export interface PersonPathRow extends RawPath { goalId: string | null; personId: string; via: "speaker" | "sponsor" | "met_before"; conferenceName?: string; metAt?: string }

/** Q2 + Q6: speakers on goal topics, sponsor staff on goal topics, and people met at earlier conferences who are here. */
export async function personPaths(userId: string, confId: string): Promise<PersonPathRow[]> {
  // people skipped at this conference (or unscoped); a skip at another conference does not hide them here
  const skippedPeople = (
    await q<{ id: string }>(
      `MATCH (:User {id:$userId})-[sk:SKIPPED]->(pp:Person) WHERE sk.conferenceId IS NULL OR sk.conferenceId = $confId RETURN DISTINCT pp.id AS id`,
      { userId, confId },
    )
  ).map((r) => r.id);
  const speakers = q<PersonPathRow>(
    `MATCH (u:User {id:$userId})-[:HAS_GOAL]->(g:Goal)
     MATCH p = (g)-[:ABOUT]->(t:Topic)<-[:ABOUT]-(s:Session)<-[:SPEAKS_AT]-(pp:Person)
     MATCH (:Conference {id:$confId})-[:HAS_SESSION]->(s)
     WHERE NOT (u)-[:IS]->(pp) AND NOT pp.id IN $skippedPeople AND NOT (u)-[:SKIPPED]->(t)
     RETURN g.id AS goalId, pp.id AS personId, 'speaker' AS via, ${PATH("p")}`,
    { userId, confId, skippedPeople },
  );
  const staff = q<PersonPathRow>(
    `MATCH (u:User {id:$userId})-[:HAS_GOAL]->(g:Goal)
     MATCH (c:Conference {id:$confId})
     MATCH p = (g)-[:ABOUT]->(t:Topic)<-[:OFFERS]-(co:Company)<-[:WORKS_AT]-(pp:Person)
     MATCH (co)-[:SPONSORS]->(c)
     WHERE NOT (u)-[:IS]->(pp) AND NOT pp.id IN $skippedPeople AND NOT (u)-[:SKIPPED]->(t)
     RETURN g.id AS goalId, pp.id AS personId, 'sponsor' AS via, ${PATH("p")}`,
    { userId, confId, skippedPeople },
  );
  const metBefore = q<PersonPathRow>(
    `MATCH (u:User {id:$userId})-[m:MET]->(pp:Person)
     WHERE m.conferenceId <> $confId AND NOT pp.id IN $skippedPeople
     MATCH p = (u)-[:MET]->(pp)-[:SPEAKS_AT]->(s:Session)<-[:HAS_SESSION]-(:Conference {id:$confId})
     MATCH (prev:Conference {id:m.conferenceId})
     RETURN null AS goalId, pp.id AS personId, 'met_before' AS via, prev.name AS conferenceName, m.at AS metAt, ${PATH("p")}`,
    { userId, confId, skippedPeople },
  );
  return (await Promise.all([speakers, staff, metBefore])).flat();
}

export interface BoothPathRow extends RawPath { sourceId: string; sourceKind: "Goal" | "Problem"; boothId: string; metPersonId: string | null }

/** Q3: booths whose company offers a topic of a problem or goal; plus the "you met someone there" path. */
export async function boothPaths(userId: string, confId: string): Promise<BoothPathRow[]> {
  const offers = q<BoothPathRow>(
    `MATCH (u:User {id:$userId})-[:HAS_PROBLEM|HAS_GOAL]->(x)
     MATCH (c:Conference {id:$confId})-[:HAS_BOOTH]->(b:Booth)
     MATCH p = (x)-[:ABOUT]->(t:Topic)<-[:OFFERS]-(co:Company)-[:HAS_BOOTH]->(b)
     WHERE NOT (u)-[:SKIPPED]->(b) AND NOT (u)-[:SKIPPED]->(t)
     RETURN x.id AS sourceId, labels(x)[0] AS sourceKind, b.id AS boothId, null AS metPersonId, ${PATH("p")}`,
    { userId, confId },
  );
  const met = q<BoothPathRow>(
    `MATCH (u:User {id:$userId})-[:HAS_PROBLEM|HAS_GOAL]->(x)
     MATCH (c:Conference {id:$confId})-[:HAS_BOOTH]->(b:Booth)
     MATCH (u)-[:MET]->(mp:Person)
     MATCH p = (x)-[:ABOUT]->(t:Topic)<-[:OFFERS]-(co:Company)<-[:WORKS_AT]-(mp)
     MATCH (co)-[:HAS_BOOTH]->(b)
     WHERE NOT (u)-[:SKIPPED]->(b)
     RETURN x.id AS sourceId, labels(x)[0] AS sourceKind, b.id AS boothId, mp.id AS metPersonId, ${PATH("p")}`,
    { userId, confId },
  );
  return (await Promise.all([offers, met])).flat();
}

// ---------- details for cards ----------

export interface SessionRow {
  id: string; conferenceId: string; title: string; abstract: string | null; kind: string; start: string; end: string;
  room: string | null; url: string | null; source: string | null; collectedAt: string | null; via: string | null;
  topics: string[]; speakers: { id: string; name: string; title: string | null; company: string | null }[];
}

export async function sessionsByIds(ids: string[]): Promise<SessionRow[]> {
  if (!ids.length) return [];
  return q<SessionRow>(
    `MATCH (s:Session) WHERE s.id IN $ids
     OPTIONAL MATCH (sp:Person)-[:SPEAKS_AT]->(s)
     WITH s, collect(DISTINCT {id:sp.id, name:sp.name, title:sp.title, company:sp.company}) AS speakers
     OPTIONAL MATCH (s)-[:ABOUT]->(t:Topic)
     RETURN s.id AS id, s.conferenceId AS conferenceId, s.title AS title, s.abstract AS abstract, s.kind AS kind,
            s.start AS start, s.end AS end, s.room AS room, s.url AS url, s.source AS source, s.collectedAt AS collectedAt,
            s.via AS via, collect(DISTINCT t.id) AS topics, speakers`,
    { ids },
  );
}

/** All timed sessions of the conference (for day bounds). */
export async function conferenceDay(confId: string): Promise<{ from: string | null; to: string | null }> {
  const [r] = await q<{ from: string | null; to: string | null }>(
    `MATCH (:Conference {id:$confId})-[:HAS_SESSION]->(s:Session) RETURN min(s.start) AS from, max(s.end) AS to`,
    { confId },
  );
  return r ?? { from: null, to: null };
}

export interface PersonRow {
  id: string; name: string; title: string | null; company: string | null; companyId: string | null; bio: string | null;
  userId: string | null; openTo: string[] | null; source: string | null; collectedAt: string | null; via: string | null;
  links?: string[] | null; photoUrl?: string | null;
}

export async function peopleByIds(ids: string[]): Promise<PersonRow[]> {
  if (!ids.length) return [];
  return q<PersonRow>(
    `MATCH (p:Person) WHERE p.id IN $ids
     OPTIONAL MATCH (p)-[:WORKS_AT]->(co:Company)
     OPTIONAL MATCH (u:User)-[:IS]->(p)
     RETURN p.id AS id, p.name AS name, p.title AS title, coalesce(co.name, p.company) AS company, co.id AS companyId,
            p.bio AS bio, u.id AS userId, coalesce(u.openTo, p.openTo) AS openTo, p.source AS source, p.collectedAt AS collectedAt, p.via AS via,
            p.links AS links, p.photoUrl AS photoUrl`,
    { ids },
  );
}

export interface BoothRow {
  id: string; conferenceId: string; label: string; hall: string | null; order: number | null;
  companyId: string; companyName: string; description: string | null; website: string | null; sponsorTier: string | null;
  topics: string[]; source: string | null; collectedAt: string | null; via: string | null;
}

export async function boothsByIds(ids: string[]): Promise<BoothRow[]> {
  if (!ids.length) return [];
  return q<BoothRow>(
    `MATCH (co:Company)-[:HAS_BOOTH]->(b:Booth) WHERE b.id IN $ids
     OPTIONAL MATCH (co)-[:OFFERS]->(t:Topic)
     RETURN b.id AS id, b.conferenceId AS conferenceId, b.label AS label, b.hall AS hall, b.order AS order,
            co.id AS companyId, co.name AS companyName, co.description AS description, co.website AS website,
            co.sponsorTier AS sponsorTier, collect(t.id) AS topics, co.source AS source, co.collectedAt AS collectedAt, co.via AS via`,
    { ids },
  );
}

// ---------- writes ----------

export interface PlanEdge { id: string; goalId: string | null; score: number; status: string; slotStart: string | null; slotEnd: string | null }

/** Replace the user's PLANS edges for this conference. */
export async function writePlans(userId: string, confId: string, edges: PlanEdge[]) {
  await q(`MATCH (:User {id:$userId})-[r:PLANS]->() WHERE r.conferenceId = $confId DELETE r`, { userId, confId });
  if (!edges.length) return;
  await q(
    `MATCH (u:User {id:$userId})
     UNWIND $edges AS e
     MATCH (x {id:e.id}) WHERE x:Session OR x:Booth OR x:Person
     MERGE (u)-[r:PLANS]->(x)
     SET r.conferenceId = $confId, r.goalId = e.goalId, r.score = e.score, r.status = e.status, r.slotStart = e.slotStart, r.slotEnd = e.slotEnd`,
    { userId, confId, edges },
  );
}
