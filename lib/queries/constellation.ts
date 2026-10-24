// Q11 inputs for the Sky: the user's personal layer around one or more conferences, plus other users and background dust.
import { q } from "@/lib/falkor";
import type { NodeLabel, WhyPath } from "@/lib/types";

export interface SkyBase {
  name: string | null;
  conferences: { id: string; name: string }[];
  goals: { id: string; text: string; weight: number; topics: string[]; own: string | null; planned: string | null }[];
  problems: { id: string; text: string; topics: string[] }[];
}

/** User, the conferences in scope (`confId`, else every ATTENDS), goals and problems. Null for an unknown user. */
export async function skyBase(userId: string, confId: string | null): Promise<SkyBase | null> {
  const [u] = await q<{ name: string | null }>(`MATCH (u:User {id:$userId}) RETURN u.name AS name`, { userId });
  if (!u) return null;
  const [conferences, goals, problems] = await Promise.all([
    confId
      ? q<{ id: string; name: string }>(`MATCH (c:Conference {id:$confId}) RETURN c.id AS id, coalesce(c.name, c.id) AS name`, { confId })
      : q<{ id: string; name: string }>(
          `MATCH (:User {id:$userId})-[:ATTENDS]->(c:Conference) RETURN c.id AS id, coalesce(c.name, c.id) AS name, c.startDate AS d ORDER BY d DESC`,
          { userId },
        ),
    q<SkyBase["goals"][number]>(
      `MATCH (u:User {id:$userId})-[:HAS_GOAL]->(g:Goal)
       OPTIONAL MATCH (g)-[:ABOUT]->(t:Topic)
       WITH u, g, collect(t.id) AS topics
       OPTIONAL MATCH (u)-[r:PLANS]->() WHERE r.goalId = g.id
       RETURN g.id AS id, g.text AS text, coalesce(g.weight, 1.0) AS weight, topics, g.conferenceId AS own, min(r.conferenceId) AS planned`,
      { userId },
    ),
    q<SkyBase["problems"][number]>(
      `MATCH (:User {id:$userId})-[:HAS_PROBLEM]->(p:Problem) OPTIONAL MATCH (p)-[:ABOUT]->(t:Topic)
       RETURN p.id AS id, p.text AS text, collect(t.id) AS topics`,
      { userId },
    ),
  ]);
  return { name: u.name, conferences, goals, problems };
}

export interface SkyMoment {
  id: string; kind: string; at: string; text: string | null; conferenceId: string;
  targetId: string | null; targetLabel: NodeLabel | null; targetTitle: string | null;
  personId: string | null; personName: string | null; topics: string[];
}

export async function skyMoments(userId: string, confIds: string[]): Promise<SkyMoment[]> {
  return q<SkyMoment>(
    `MATCH (:User {id:$userId})-[:CAPTURED]->(m:Moment) WHERE m.conferenceId IN $confIds
     OPTIONAL MATCH (m)-[:AT]->(x)
     OPTIONAL MATCH (co:Company)-[:HAS_BOOTH]->(x)
     OPTIONAL MATCH (m)-[:MET]->(p:Person)
     OPTIONAL MATCH (m)-[:MENTIONS]->(t:Topic)
     RETURN m.id AS id, m.kind AS kind, m.at AS at, m.text AS text, m.conferenceId AS conferenceId,
            x.id AS targetId, labels(x)[0] AS targetLabel, coalesce(x.title, x.label + coalesce(' · ' + co.name, '')) AS targetTitle,
            p.id AS personId, p.name AS personName, collect(DISTINCT t.id) AS topics
     ORDER BY at DESC LIMIT 200`,
    { userId, confIds },
  );
}

/** People met at these conferences (the `(User)-[:MET]->(Person)` shortcut). */
export async function skyMet(userId: string, confIds: string[]) {
  return q<{ id: string; name: string; at: string | null; conferenceId: string }>(
    `MATCH (:User {id:$userId})-[r:MET]->(p:Person) WHERE r.conferenceId IN $confIds
     RETURN p.id AS id, p.name AS name, r.at AS at, r.conferenceId AS conferenceId`,
    { userId, confIds },
  );
}

/** Things the user skipped at these conferences (rendered hidden, so steer can animate them out). */
export async function skySkipped(userId: string, confIds: string[]) {
  return q<{ id: string; label: NodeLabel; name: string; conferenceId: string | null }>(
    `MATCH (:User {id:$userId})-[:SKIPPED]->(x) WHERE (x:Session OR x:Booth) AND x.conferenceId IN $confIds
     OPTIONAL MATCH (co:Company)-[:HAS_BOOTH]->(x)
     RETURN x.id AS id, labels(x)[0] AS label, coalesce(x.title, x.label + coalesce(' · ' + co.name, '')) AS name, x.conferenceId AS conferenceId
     UNION
     MATCH (:User {id:$userId})-[:SKIPPED]->(x:Person)
     RETURN x.id AS id, 'Person' AS label, x.name AS name, null AS conferenceId`,
    { userId, confIds },
  );
}

/** Q7: other users who plan or checked in at any of `ids`. */
export async function skyOthers(userId: string, ids: string[], confIds: string[]) {
  if (!ids.length) return [];
  return q<{ userId: string; name: string | null; targetId: string; type: "PLANS" | "AT" }>(
    `MATCH (o:User)-[r:PLANS]->(x) WHERE x.id IN $ids AND o.id <> $userId AND r.conferenceId IN $confIds AND r.status <> 'skipped'
     RETURN o.id AS userId, o.name AS name, x.id AS targetId, 'PLANS' AS type
     UNION
     MATCH (o:User)-[:CAPTURED]->(m:Moment)-[:AT]->(x) WHERE x.id IN $ids AND o.id <> $userId AND m.conferenceId IN $confIds
     RETURN o.id AS userId, o.name AS name, x.id AS targetId, 'AT' AS type`,
    { userId, ids, confIds },
  );
}

/** Background stars: the conference's sessions and booths (the caller drops ones already in the Sky and caps). */
export async function skyDust(confId: string, limit: number) {
  const n = Math.max(0, Math.floor(limit));
  const [sessions, booths] = await Promise.all([
    q<{ id: string; label: string }>(
      `MATCH (:Conference {id:$confId})-[:HAS_SESSION]->(s:Session) RETURN s.id AS id, s.title AS label, s.start AS start ORDER BY start LIMIT ${n}`,
      { confId },
    ),
    q<{ id: string; label: string }>(
      `MATCH (:Conference {id:$confId})-[:HAS_BOOTH]->(b:Booth) OPTIONAL MATCH (co:Company)-[:HAS_BOOTH]->(b)
       RETURN b.id AS id, coalesce(co.name, b.label) AS label, b.order AS o ORDER BY o LIMIT ${n}`,
      { confId },
    ),
  ]);
  return { sessions, booths };
}

/** Paths cited by stored briefs/trip reports, so a tapped brief line can light up in the Sky. */
export async function skySummaryPaths(userId: string, confIds: string[]): Promise<{ conferenceId: string; paths: WhyPath[] }[]> {
  const rows = await q<{ conferenceId: string; json: string }>(
    `MATCH (:User {id:$userId})-[:HAS_SUMMARY]->(s:Summary) WHERE s.kind IN ['brief', 'trip'] AND s.conferenceId IN $confIds
     RETURN s.conferenceId AS conferenceId, s.json AS json`,
    { userId, confIds },
  );
  return rows.map((r) => {
    try {
      return { conferenceId: r.conferenceId, paths: (JSON.parse(r.json) as { paths?: WhyPath[] }).paths ?? [] };
    } catch {
      return { conferenceId: r.conferenceId, paths: [] };
    }
  });
}
