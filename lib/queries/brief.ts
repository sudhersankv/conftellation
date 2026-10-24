// Recapper inputs (spec Q8). Every row carries real named paths; the Recapper only words them.
import { q } from "@/lib/falkor";
import type { RawPath } from "./plan";

/** `{nodes, edges}` of named path `p` as `alias` (null when the path is null, e.g. from an OPTIONAL MATCH). */
/** `hideMoments`: name Moment nodes by kind, never text (for paths through another user's moments). */
const P = (p: string, alias: string, hideMoments = false) => `CASE WHEN ${p} IS NULL THEN null ELSE {
  nodes: [n IN nodes(${p}) | {id:n.id, label:labels(n)[0], name:${hideMoments
    ? "CASE WHEN labels(n)[0] = 'Moment' THEN coalesce(n.kind, 'moment') ELSE coalesce(n.name, n.title, n.text, n.label, n.id) END"
    : "coalesce(n.name, n.title, n.text, n.label, n.id)"}}],
  edges: [r IN relationships(${p}) | {from:startNode(r).id, to:endNode(r).id, type:type(r)}]
} END AS ${alias}`;

const ON_DAY = (at: string) => `($date IS NULL OR ${at} STARTS WITH $date)`;

interface Args { userId: string; confId: string; date: string | null }

export async function briefHeader(a: Args) {
  const [r] = await q<{ userName: string | null; confName: string | null; checkins: number }>(
    `MATCH (u:User {id:$userId})
     OPTIONAL MATCH (c:Conference {id:$confId})
     OPTIONAL MATCH (u)-[:CAPTURED]->(m:Moment {kind:'checkin'}) WHERE m.conferenceId = $confId AND ${ON_DAY("m.at")}
     RETURN u.name AS userName, c.name AS confName, count(m) AS checkins`,
    { ...a },
  );
  return r ?? null;
}

export interface NoteRow {
  momentId: string; text: string; at: string; kind: string;
  goalId: string | null; goalText: string | null; weight: number | null; topic: string | null; targetTitle: string | null;
  at_: RawPath | null; goal: RawPath | null; own: RawPath;
}

/** (a) What you learned: the user's notes, linked to the goal they serve (moment → topic ← goal) and where they were taken. */
export function notePaths(a: Args) {
  return q<NoteRow>(
    `MATCH own = (u:User {id:$userId})-[:CAPTURED]->(m:Moment)
     WHERE m.conferenceId = $confId AND m.kind <> 'checkin' AND m.kind <> 'met' AND m.text IS NOT NULL AND ${ON_DAY("m.at")}
     OPTIONAL MATCH at_ = (m)-[:AT]->(x)
     OPTIONAL MATCH goal = (m)-[:MENTIONS]->(t:Topic)<-[:ABOUT]-(g:Goal)<-[:HAS_GOAL]-(u)
     RETURN m.id AS momentId, m.text AS text, m.at AS at, m.kind AS kind, g.id AS goalId, g.text AS goalText, g.weight AS weight,
            t.name AS topic, coalesce(x.title, x.label) AS targetTitle, ${P("at_", "at_")}, ${P("goal", "goal")}, ${P("own", "own")}`,
    { ...a },
  );
}

export interface SeenRow { sessionId: string; title: string; at: string; goalId: string; goalText: string; weight: number; topic: string; path: RawPath }

/** (a') What you saw: sessions checked into that serve a goal. */
export function seenPaths(a: Args) {
  return q<SeenRow>(
    `MATCH (u:User {id:$userId})-[:CAPTURED]->(m:Moment {kind:'checkin'})
     WHERE m.conferenceId = $confId AND ${ON_DAY("m.at")}
     MATCH path = (m)-[:AT]->(s:Session)-[:ABOUT]->(t:Topic)<-[:ABOUT]-(g:Goal)<-[:HAS_GOAL]-(u)
     RETURN s.id AS sessionId, s.title AS title, m.at AS at, g.id AS goalId, g.text AS goalText, coalesce(g.weight, 1.0) AS weight,
            t.name AS topic, ${P("path", "path")}`,
    { ...a },
  );
}

export interface MetRow {
  personId: string; name: string; company: string | null; title: string | null; openTo: string[] | null; at: string;
  note: string | null; goalId: string | null; goalText: string | null; weight: number | null; topic: string | null;
  met: RawPath; goal: RawPath | null;
}

/** (c) People met today and the goal each meeting served (met-moment → topic ← goal). */
export function metPaths(a: Args) {
  return q<MetRow>(
    `MATCH met = (u:User {id:$userId})-[r:MET]->(pp:Person)
     WHERE r.conferenceId = $confId AND ${ON_DAY("r.at")}
     OPTIONAL MATCH (pp)-[:WORKS_AT]->(co:Company)
     OPTIONAL MATCH (pu:User)-[:IS]->(pp)
     OPTIONAL MATCH goal = (pp)<-[:MET]-(m:Moment)-[:MENTIONS]->(t:Topic)<-[:ABOUT]-(g:Goal)<-[:HAS_GOAL]-(u)
     WHERE m.conferenceId = $confId
     RETURN pp.id AS personId, pp.name AS name, coalesce(co.name, pp.company) AS company, pp.title AS title,
            coalesce(pu.openTo, pp.openTo) AS openTo, r.at AS at, m.text AS note, g.id AS goalId, g.text AS goalText,
            g.weight AS weight, t.name AS topic, ${P("met", "met")}, ${P("goal", "goal")}`,
    { ...a },
  );
}

export interface ProblemRow {
  problemId: string; problemText: string; boothId: string; boothLabel: string; company: string; topic: string;
  staffId: string | null; staffName: string | null; visits: number; offer: RawPath; staff: RawPath | null;
}

/** (b) Q3 per problem: booths here whose company offers a problem topic, plus "you met their staff". */
export function problemPaths(a: Args) {
  return q<ProblemRow>(
    `MATCH (u:User {id:$userId})-[:HAS_PROBLEM]->(pr:Problem)
     MATCH (:Conference {id:$confId})-[:HAS_BOOTH]->(b:Booth)
     MATCH offer = (pr)-[:ABOUT]->(t:Topic)<-[:OFFERS]-(co:Company)-[:HAS_BOOTH]->(b)
     OPTIONAL MATCH staff = (u)-[mr:MET]->(mp:Person)-[:WORKS_AT]->(co) WHERE mr.conferenceId = $confId
     OPTIONAL MATCH (u)-[:CAPTURED]->(vm:Moment)-[:AT]->(b)
     RETURN pr.id AS problemId, pr.text AS problemText, b.id AS boothId, b.label AS boothLabel, co.name AS company, t.name AS topic,
            mp.id AS staffId, mp.name AS staffName, count(DISTINCT vm) AS visits, ${P("offer", "offer")}, ${P("staff", "staff")}`,
    { ...a },
  );
}

export interface IntroRow { viaName: string; personId: string; name: string; sawAt: string; speaksOn: string; topic: string; saw: RawPath; speaks: RawPath }

/**
 * (d) Q5 warm intro: someone you met here (MET edge for this conference) checked in at or shared a moment from a session whose
 * speaker talks on your problem. Private notes never count, and Moment nodes in the path are named by kind.
 */
export function introPaths(a: Args) {
  return q<IntroRow>(
    `MATCH saw = (u:User {id:$userId})-[met:MET]->(a:Person)<-[:IS]-(au:User)-[:CAPTURED]->(m:Moment)-[:AT]->(s:Session)<-[:SPEAKS_AT]-(b:Person)
     WHERE met.conferenceId = $confId AND m.conferenceId = $confId AND (m.kind = 'checkin' OR m.shared = true)
       AND NOT (u)-[:MET]->(b) AND NOT (u)-[:IS]->(b) AND au <> u
     MATCH speaks = (b)-[:SPEAKS_AT]->(s2:Session)-[:ABOUT]->(t:Topic)<-[:ABOUT]-(:Problem)<-[:HAS_PROBLEM]-(u)
     MATCH (:Conference {id:$confId})-[:HAS_SESSION]->(s2)
     RETURN a.name AS viaName, b.id AS personId, b.name AS name, s.title AS sawAt, s2.title AS speaksOn, t.name AS topic,
            ${P("saw", "saw", true)}, ${P("speaks", "speaks")}
     LIMIT 6`,
    { ...a },
  );
}

export interface BeforeRow { personId: string; name: string; prevConf: string; metAt: string; session: string; path: RawPath }

/** (e) Q6 met before: people met at an earlier conference who speak here. */
export function beforePaths(a: Args) {
  return q<BeforeRow>(
    `MATCH (u:User {id:$userId})-[m:MET]->(pp:Person)
     WHERE m.conferenceId <> $confId
     MATCH path = (u)-[:MET]->(pp)-[:SPEAKS_AT]->(s:Session)<-[:HAS_SESSION]-(:Conference {id:$confId})
     MATCH (prev:Conference {id:m.conferenceId})
     RETURN pp.id AS personId, pp.name AS name, prev.name AS prevConf, m.at AS metAt, s.title AS session, ${P("path", "path")}`,
    { ...a },
  );
}

export interface MeetRow { meetId: string; otherName: string; status: string; path: RawPath }

/** (f) Accepted meets at this conference, either direction. */
export function meetPaths(a: Args) {
  return q<MeetRow>(
    `MATCH path = (u:User {id:$userId})-[r:REQUESTED_MEET]-(o:User)
     WHERE r.status = 'accepted' AND r.conferenceId = $confId
     RETURN r.id AS meetId, o.name AS otherName, r.status AS status, ${P("path", "path")}`,
    { ...a },
  );
}

// ---------- stored summaries (DEMO_MODE precompute) ----------

export async function readSummary(id: string): Promise<{ json: string; generatedAt: string } | null> {
  const [r] = await q<{ json: string; generatedAt: string }>(`MATCH (s:Summary {id:$id}) RETURN s.json AS json, s.generatedAt AS generatedAt`, { id });
  return r ?? null;
}

/** MERGE a Summary node; `ownerId` is the User (brief/trip) or Session (crowd) it hangs off via HAS_SUMMARY. */
export async function writeSummary(s: { id: string; kind: string; ownerId: string; conferenceId: string; json: string; generatedAt: string }) {
  await q(
    `MATCH (o {id:$ownerId}) WHERE o:User OR o:Session
     MERGE (s:Summary {id:$id})
     SET s.kind = $kind, s.conferenceId = $conferenceId, s.json = $json, s.generatedAt = $generatedAt
     MERGE (o)-[:HAS_SUMMARY]->(s)`,
    s,
  );
}

/** Drop a stored summary so an empty regeneration cannot leave the previous body in place. */
export async function deleteSummary(id: string) {
  await q(`MATCH (s:Summary {id:$id}) DETACH DELETE s`, { id });
}
