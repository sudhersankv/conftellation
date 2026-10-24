// Scribe Cypher: resolve where a capture attaches, write the Moment + edges, read moments back.
import { q } from "@/lib/falkor";
import type { Moment, MomentKind } from "@/lib/types";

export interface TargetRow { id: string; label: "Session" | "Booth"; title: string; conferenceId: string | null; start: string | null; end: string | null }

const TARGET = `x.id AS id, labels(x)[0] AS label, coalesce(x.title, x.label + coalesce(' · ' + co.name, '')) AS title,
  x.conferenceId AS conferenceId, x.start AS start, x.end AS end`;

export async function userExists(userId: string): Promise<boolean> {
  return (await q(`MATCH (u:User {id:$userId}) RETURN u.id AS id`, { userId })).length > 0;
}

export async function targetById(id: string): Promise<TargetRow | null> {
  const [r] = await q<TargetRow>(
    `MATCH (x {id:$id}) WHERE x:Session OR x:Booth OPTIONAL MATCH (co:Company)-[:HAS_BOOTH]->(x) RETURN ${TARGET} LIMIT 1`,
    { id },
  );
  return r ?? null;
}

/** Inputs of the "now" rule: the user's latest check-ins and their planned session slots at the conference. */
export async function nowInputs(userId: string, confId: string) {
  const [checkins, slots] = await Promise.all([
    q<TargetRow & { at: string }>(
      `MATCH (:User {id:$userId})-[:CAPTURED]->(m:Moment {kind:'checkin'})-[:AT]->(x) WHERE m.conferenceId = $confId
       OPTIONAL MATCH (co:Company)-[:HAS_BOOTH]->(x)
       RETURN ${TARGET}, m.at AS at ORDER BY at DESC LIMIT 20`,
      { userId, confId },
    ),
    q<TargetRow & { slotStart: string; slotEnd: string }>(
      `MATCH (:User {id:$userId})-[r:PLANS]->(x:Session) WHERE r.conferenceId = $confId AND r.slotStart IS NOT NULL AND r.status <> 'skipped'
       OPTIONAL MATCH (co:Company)-[:HAS_BOOTH]->(x)
       RETURN ${TARGET}, r.slotStart AS slotStart, r.slotEnd AS slotEnd`,
      { userId, confId },
    ),
  ]);
  return { checkins, slots };
}

export async function personExists(id: string): Promise<boolean> {
  return (await q(`MATCH (p:Person {id:$id}) RETURN p.id AS id`, { id })).length > 0;
}

/** "Met someone new": a user-entered Person (MERGE on the identity-rule id), linked to an existing Company by name if there is one. */
export async function upsertMetPerson(p: { id: string; name: string; company: string | null; companySlug: string | null; at: string }) {
  await q(
    `MERGE (p:Person {id:$id}) ON CREATE SET p.name = $name, p.company = $company, p.via = 'user', p.source = 'conftellations', p.collectedAt = $at`,
    p,
  );
  if (!p.company) return;
  await q(
    `MATCH (p:Person {id:$id})
     OPTIONAL MATCH (known:Company) WHERE toLower(known.name) = toLower($company)
     WITH p, known
     FOREACH (_ IN CASE WHEN known IS NULL THEN [1] ELSE [] END |
       MERGE (co:Company {id:$companySlug}) ON CREATE SET co.name = $company, co.via = 'user', co.source = 'conftellations', co.collectedAt = $at
       MERGE (p)-[:WORKS_AT]->(co))
     FOREACH (_ IN CASE WHEN known IS NULL THEN [] ELSE [1] END | MERGE (p)-[:WORKS_AT]->(known))`,
    p,
  );
}

/** Topics of the conference (session ABOUT + sponsor OFFERS), for tagging captures with existing names. */
export async function conferenceTopics(confId: string): Promise<{ id: string; name: string }[]> {
  return q(
    `MATCH (:Conference {id:$confId})-[:HAS_SESSION]->(:Session)-[:ABOUT]->(t:Topic) RETURN DISTINCT t.id AS id, coalesce(t.name, t.id) AS name
     UNION
     MATCH (:Conference {id:$confId})-[:HAS_BOOTH]->(:Booth)<-[:HAS_BOOTH]-(:Company)-[:OFFERS]->(t:Topic) RETURN DISTINCT t.id AS id, coalesce(t.name, t.id) AS name`,
    { confId },
  );
}

/** Topics the target is about (session ABOUT, or booth company OFFERS). */
export async function targetTopics(targetId: string): Promise<string[]> {
  const rows = await q<{ id: string }>(
    `MATCH (:Session {id:$targetId})-[:ABOUT]->(t:Topic) RETURN t.id AS id
     UNION
     MATCH (:Booth {id:$targetId})<-[:HAS_BOOTH]-(:Company)-[:OFFERS]->(t:Topic) RETURN t.id AS id`,
    { targetId },
  );
  return rows.map((r) => r.id);
}

export interface MomentWrite {
  id: string; userId: string; confId: string; kind: MomentKind; at: string; text: string | null; mediaUrl: string | null;
  shared: boolean; targetId: string; personId: string; topics: string[];
}

/**
 * MERGE the Moment on its id (a client retry is a no-op), link CAPTURED/DURING/AT/MET/MENTIONS,
 * add a per-conference `(User)-[:MET]->(Person)` shortcut, and flip matching PLANS edges to done.
 * Returns false when the user or conference doesn't exist.
 */
export async function writeMoment(w: MomentWrite): Promise<boolean> {
  const rows = await q<{ id: string }>(
    `MATCH (u:User {id:$userId}), (c:Conference {id:$confId})
     MERGE (m:Moment {id:$id})
     ON CREATE SET m.kind = $kind, m.at = $at, m.text = $text, m.mediaUrl = $mediaUrl, m.shared = $shared,
                   m.userId = $userId, m.conferenceId = $confId, m.via = 'user', m.source = 'conftellations', m.collectedAt = $at
     MERGE (u)-[:CAPTURED]->(m)
     MERGE (m)-[:DURING]->(c)
     WITH u, m
     OPTIONAL MATCH (x {id:$targetId}) WHERE x:Session OR x:Booth
     FOREACH (_ IN CASE WHEN x IS NULL THEN [] ELSE [1] END | MERGE (m)-[:AT]->(x))
     WITH u, m
     OPTIONAL MATCH (p:Person {id:$personId})
     FOREACH (_ IN CASE WHEN p IS NULL THEN [] ELSE [1] END |
       MERGE (m)-[:MET]->(p)
       MERGE (u)-[mt:MET {conferenceId:$confId}]->(p) ON CREATE SET mt.at = $at)
     FOREACH (tid IN $topics | MERGE (t:Topic {id:tid}) ON CREATE SET t.name = tid MERGE (m)-[:MENTIONS]->(t))
     RETURN m.id AS id`,
    { ...w },
  );
  if (!rows.length) return false;
  await q(
    `MATCH (:User {id:$userId})-[r:PLANS]->(y) WHERE r.conferenceId = $confId AND y.id IN [$targetId, $personId] SET r.status = 'done'`,
    { userId: w.userId, confId: w.confId, targetId: w.targetId, personId: w.personId },
  );
  return true;
}

/** Add topics to an existing moment (background tagging). */
export async function addMentions(momentId: string, topics: string[]) {
  if (!topics.length) return;
  await q(
    `MATCH (m:Moment {id:$momentId}) UNWIND $topics AS tid MATCH (t:Topic {id:tid}) MERGE (m)-[:MENTIONS]->(t)`,
    { momentId, topics },
  );
}

export async function setMomentEmbedding(momentId: string, v: number[]) {
  await q(`MATCH (m:Moment {id:$momentId}) SET m.embedding = vecf32($v)`, { momentId, v });
}

/** The goal a capture serves: the PLANS goal of its target/person, else the goal sharing most topics with the moment. */
export async function goalForMoment(userId: string, momentId: string, ids: string[]): Promise<string | null> {
  const [planned] = await q<{ goalId: string }>(
    `MATCH (u:User {id:$userId})-[r:PLANS]->(x) WHERE x.id IN $ids AND r.goalId IS NOT NULL
     MATCH (u)-[:HAS_GOAL]->(g:Goal {id:r.goalId})
     RETURN g.id AS goalId, r.score AS score ORDER BY score DESC LIMIT 1`,
    { userId, ids },
  );
  if (planned) return planned.goalId;
  const [byTopic] = await q<{ goalId: string }>(
    `MATCH (:User {id:$userId})-[:HAS_GOAL]->(g:Goal)-[:ABOUT]->(t:Topic)<-[:MENTIONS]-(:Moment {id:$momentId})
     RETURN g.id AS goalId, count(DISTINCT t) AS n, coalesce(g.weight, 1.0) AS w ORDER BY n DESC, w DESC LIMIT 1`,
    { userId, momentId },
  );
  return byTopic?.goalId ?? null;
}

const MOMENT = `
  OPTIONAL MATCH (m)-[:AT]->(x)
  OPTIONAL MATCH (co:Company)-[:HAS_BOOTH]->(x)
  OPTIONAL MATCH (m)-[:MET]->(p:Person)
  OPTIONAL MATCH (m)-[:MENTIONS]->(t:Topic)
  RETURN m.id AS id, u.id AS userId, m.conferenceId AS conferenceId, m.kind AS kind, m.at AS at, m.text AS text,
         m.mediaUrl AS mediaUrl, coalesce(m.shared, false) AS shared, x.id AS targetId,
         coalesce(x.title, x.label + coalesce(' · ' + co.name, '')) AS targetTitle, p.id AS personId, collect(DISTINCT t.id) AS topics`;

type MomentRow = { [K in keyof Moment]: Moment[K] | null } & { id: string; topics: string[] };

function toMoment(r: MomentRow): Moment {
  const out: Moment = {
    id: r.id, userId: r.userId!, conferenceId: r.conferenceId!, kind: r.kind!, at: r.at!, shared: Boolean(r.shared), topics: r.topics ?? [],
  };
  if (r.text) out.text = r.text;
  if (r.mediaUrl) out.mediaUrl = r.mediaUrl;
  if (r.targetId) { out.targetId = r.targetId; if (r.targetTitle) out.targetTitle = r.targetTitle; }
  if (r.personId) out.personId = r.personId;
  return out;
}

export async function momentById(id: string): Promise<Moment | null> {
  const [r] = await q<MomentRow>(`MATCH (u:User)-[:CAPTURED]->(m:Moment {id:$id}) ${MOMENT}`, { id });
  return r ? toMoment(r) : null;
}

/** "network" → public to the session community (`shared:true`); user ids → SHARED_WITH edges; [] → private again. */
export async function shareMoment(id: string, to: string[] | "network"): Promise<boolean> {
  if (to === "network") {
    return (await q(`MATCH (m:Moment {id:$id}) SET m.shared = true RETURN m.id AS id`, { id })).length > 0;
  }
  if (!to.length) {
    const rows = await q(`MATCH (m:Moment {id:$id}) SET m.shared = false WITH m OPTIONAL MATCH (m)-[r:SHARED_WITH]->() DELETE r RETURN DISTINCT m.id AS id`, { id });
    return rows.length > 0;
  }
  const rows = await q(
    `MATCH (m:Moment {id:$id}) WITH m UNWIND $to AS uid MATCH (o:User {id:uid}) MERGE (m)-[:SHARED_WITH]->(o) RETURN DISTINCT m.id AS id`,
    { id, to },
  );
  if (rows.length) return true;
  return (await q(`MATCH (m:Moment {id:$id}) RETURN m.id AS id`, { id })).length > 0;
}
