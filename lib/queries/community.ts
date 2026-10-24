// Session community (spec Q9) and personal record (Q10).
import { q } from "@/lib/falkor";

export interface MomentRow {
  id: string; userId: string; author: string | null; conferenceId: string; kind: string; at: string; text: string | null;
  mediaUrl: string | null; shared: boolean | null; targetId: string | null; targetTitle: string | null; personId: string | null; topics: string[];
}

const MOMENT = `m.id AS id, u.id AS userId, u.name AS author, m.conferenceId AS conferenceId, m.kind AS kind, m.at AS at, m.text AS text,
  m.mediaUrl AS mediaUrl, m.shared AS shared, s.id AS targetId, s.title AS targetTitle, p.id AS personId, collect(DISTINCT t.id) AS topics`;

/** Moments at the session: shared ones from everyone (`shared`), or all of one user's (`mine`). */
export function sessionMoments(sessionId: string, opts: { shared?: boolean; userId?: string }) {
  return q<MomentRow>(
    `MATCH (s:Session {id:$sessionId})<-[:AT]-(m:Moment)<-[:CAPTURED]-(u:User)
     WHERE ($userId IS NULL OR u.id = $userId) AND ($shared IS NULL OR m.shared = $shared)
     OPTIONAL MATCH (m)-[:MET]->(p:Person)
     OPTIONAL MATCH (m)-[:MENTIONS]->(t:Topic)
     RETURN ${MOMENT} ORDER BY at`,
    { sessionId, shared: opts.shared ?? null, userId: opts.userId ?? null },
  );
}

/** Q9b: every moment time at the session (counts only leave this module). */
export async function sessionMomentTimes(sessionId: string): Promise<string[]> {
  const rows = await q<{ at: string }>(`MATCH (:Session {id:$sessionId})<-[:AT]-(m:Moment) RETURN m.at AS at ORDER BY at`, { sessionId });
  return rows.map((r) => r.at);
}

export interface RecordRow {
  id: string; name: string; url: string | null; startDate: string | null; endDate: string | null; city: string | null;
  source: string | null; collectedAt: string | null; via: string | null;
  sessions: number; people: number; moments: number; hasBrief: boolean; hasTrip: boolean;
}

/** Q10: conferences the user attends, newest first, with what they did there. */
export function personalRecord(userId: string) {
  return q<RecordRow>(
    `MATCH (u:User {id:$userId})-[:ATTENDS]->(c:Conference)
     OPTIONAL MATCH (u)-[m:MET]->(p:Person) WHERE m.conferenceId = c.id
     WITH u, c, count(DISTINCT p) AS people
     OPTIONAL MATCH (u)-[:CAPTURED]->(mo:Moment)-[:DURING]->(c)
     WITH u, c, people, count(DISTINCT mo) AS moments
     OPTIONAL MATCH (u)-[:CAPTURED]->(:Moment)-[:AT]->(s:Session)<-[:HAS_SESSION]-(c)
     WITH u, c, people, moments, count(DISTINCT s) AS sessions
     OPTIONAL MATCH (u)-[:HAS_SUMMARY]->(sb:Summary {kind:'brief'}) WHERE sb.conferenceId = c.id
     WITH u, c, people, moments, sessions, count(sb) AS briefs
     OPTIONAL MATCH (u)-[:HAS_SUMMARY]->(st:Summary {kind:'trip'}) WHERE st.conferenceId = c.id
     RETURN c.id AS id, c.name AS name, c.url AS url, c.startDate AS startDate, c.endDate AS endDate, c.city AS city,
            c.source AS source, c.collectedAt AS collectedAt, c.via AS via,
            sessions, people, moments, briefs > 0 AS hasBrief, count(st) > 0 AS hasTrip
     ORDER BY startDate DESC`,
    { userId },
  );
}

export async function userRow(userId: string) {
  const [u] = await q<{ id: string; name: string | null; personId: string | null; availFrom: string | null; availTo: string | null; openTo: string[] | null }>(
    `MATCH (u:User {id:$userId}) OPTIONAL MATCH (u)-[:IS]->(p:Person)
     RETURN u.id AS id, u.name AS name, coalesce(p.id, u.personId) AS personId, u.availFrom AS availFrom, u.availTo AS availTo, u.openTo AS openTo`,
    { userId },
  );
  return u ?? null;
}

/** Sessions of a conference that have shared moments (for crowd-summary precompute). */
export async function sessionsWithSharedMoments(confId: string): Promise<string[]> {
  const rows = await q<{ id: string }>(
    `MATCH (:Conference {id:$confId})-[:HAS_SESSION]->(s:Session)<-[:AT]-(:Moment {shared:true}) RETURN DISTINCT s.id AS id`,
    { confId },
  );
  return rows.map((r) => r.id);
}
