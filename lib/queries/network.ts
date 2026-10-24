// Intros (Q5, Q6), network overlap (Q7), meet requests, accepted Meets. Every intro carries its named path.
import { q } from "@/lib/falkor";
import type { RawPath } from "@/lib/queries/plan";
import type { MetPerson } from "@/lib/types";

// A Moment in a path is named by its kind, never its text (it can be another user's note).
const PATH = (p: string, as = "") => `
  [n IN nodes(${p}) | {id:n.id, label:labels(n)[0],
    name:CASE WHEN labels(n)[0] = 'Moment' THEN coalesce(n.kind, 'moment') ELSE coalesce(n.name, n.title, n.text, n.label, n.id) END}] AS ${as ? `${as}Nodes` : "nodes"},
  [r IN relationships(${p}) | {from:startNode(r).id, to:endNode(r).id, type:type(r)}] AS ${as ? `${as}Edges` : "edges"}`;

// ---------- intros ----------

export interface WarmIntroRow extends RawPath {
  isProblem: boolean; personId: string; viaPersonId: string; viaName: string; personName: string; sawAt: string; speaksOn: string; topic: string;
  tailNodes: RawPath["nodes"]; tailEdges: RawPath["edges"];
}

/**
 * Q5: you met a user here (a MET edge for this conference) → they checked in at (or shared a moment from) a session → its speaker
 * also speaks here on your problem/goal topic. Private notes never count.
 */
export async function warmIntros(userId: string, confId: string): Promise<WarmIntroRow[]> {
  return q<WarmIntroRow>(
    `MATCH p = (u:User {id:$userId})-[met:MET]->(a:Person)<-[:IS]-(au:User)-[:CAPTURED]->(m:Moment)-[:AT]->(s:Session)<-[:SPEAKS_AT]-(b:Person)
     WHERE met.conferenceId = $confId AND m.conferenceId = $confId AND (m.kind = 'checkin' OR m.shared = true)
       AND NOT (u)-[:MET]->(b) AND NOT (u)-[:IS]->(b) AND au <> u
     MATCH tail = (b)-[:SPEAKS_AT]->(s2:Session)-[:ABOUT]->(t:Topic)<-[:ABOUT]-(x)<-[:HAS_PROBLEM|HAS_GOAL]-(u)
     MATCH (:Conference {id:$confId})-[:HAS_SESSION]->(s2)
     WITH p, tail, a, b, s, s2, t, labels(x)[0] = 'Problem' AS isProblem
     ORDER BY isProblem DESC
     RETURN b.id AS personId, b.name AS personName, a.id AS viaPersonId, a.name AS viaName, s.title AS sawAt, s2.title AS speaksOn,
            coalesce(t.name, t.id) AS topic, isProblem, ${PATH("p")}, ${PATH("tail", "tail")}`,
    { userId, confId },
  );
}

export interface MetBeforeRow extends RawPath { personId: string; personName: string; conferenceName: string; metAt: string; speaksOn: string | null }

/** Q6: people you met at another conference who speak or attend here. */
export async function metBefore(userId: string, confId: string): Promise<MetBeforeRow[]> {
  const speakers = q<MetBeforeRow>(
    `MATCH p = (u:User {id:$userId})-[m:MET]->(pp:Person)-[:SPEAKS_AT]->(s:Session)<-[:HAS_SESSION]-(:Conference {id:$confId})
     WHERE m.conferenceId <> $confId
     MATCH (prev:Conference {id:m.conferenceId})
     RETURN pp.id AS personId, pp.name AS personName, prev.name AS conferenceName, m.at AS metAt, s.title AS speaksOn, ${PATH("p")}`,
    { userId, confId },
  );
  const attendees = q<MetBeforeRow>(
    `MATCH p = (u:User {id:$userId})-[m:MET]->(pp:Person)<-[:IS]-(o:User)-[:ATTENDS]->(:Conference {id:$confId})
     WHERE m.conferenceId <> $confId AND o <> u
     MATCH (prev:Conference {id:m.conferenceId})
     RETURN pp.id AS personId, pp.name AS personName, prev.name AS conferenceName, m.at AS metAt, null AS speaksOn, ${PATH("p")}`,
    { userId, confId },
  );
  return (await Promise.all([speakers, attendees])).flat();
}

// ---------- network ----------

export interface NetworkRow {
  id: string; name: string; personId: string | null; openTo: string[] | null; availFrom: string | null; availTo: string | null;
  shared: { id: string; title: string; label: string }[];
}

/** Q7: other users attending, with the sessions/booths you both plan or checked in at. */
export async function networkOverlap(userId: string, confId: string): Promise<NetworkRow[]> {
  return q<NetworkRow>(
    `MATCH (me:User {id:$userId})
     OPTIONAL MATCH (me)-[r:PLANS]->(x) WHERE r.conferenceId = $confId AND (x:Session OR x:Booth)
     WITH me, collect(DISTINCT x.id) AS planned
     OPTIONAL MATCH (me)-[:CAPTURED]->(mm:Moment)-[:AT]->(y) WHERE mm.conferenceId = $confId AND (mm.kind = 'checkin' OR mm.shared = true)
     WITH me, planned, collect(DISTINCT y.id) AS seen
     WITH me, planned + seen AS mine
     MATCH (o:User)-[:ATTENDS]->(:Conference {id:$confId}) WHERE o <> me
     OPTIONAL MATCH (o)-[ro:PLANS]->(x1) WHERE ro.conferenceId = $confId AND x1.id IN mine
     WITH o, mine, collect(DISTINCT x1) AS a
     OPTIONAL MATCH (o)-[:CAPTURED]->(om:Moment)-[:AT]->(x2) WHERE om.conferenceId = $confId AND (om.kind = 'checkin' OR om.shared = true) AND x2.id IN mine
     WITH o, a, collect(DISTINCT x2) AS b2
     WITH o, a + b2 AS xs
     OPTIONAL MATCH (o)-[:IS]->(p:Person)
     OPTIONAL MATCH (co:Company)-[:HAS_BOOTH]->(b:Booth) WHERE b.id IN [x IN xs | x.id]
     WITH o, p, xs, collect({id:b.id, name:co.name}) AS boothNames
     RETURN o.id AS id, o.name AS name, coalesce(p.id, o.personId) AS personId, o.openTo AS openTo, o.availFrom AS availFrom, o.availTo AS availTo,
            [x IN xs | {id:x.id, label:labels(x)[0], title:coalesce(x.title, head([bn IN boothNames WHERE bn.id = x.id | bn.name]), x.label)}] AS shared`,
    { userId, confId },
  );
}

/** Q7b: goal topics you share with each other user. */
export async function sharedGoalTopics(userId: string, others: string[]): Promise<{ id: string; topics: string[] }[]> {
  if (!others.length) return [];
  return q(
    `MATCH (:User {id:$userId})-[:HAS_GOAL]->(:Goal)-[:ABOUT]->(t:Topic)<-[:ABOUT]-(:Goal)<-[:HAS_GOAL]-(o:User)
     WHERE o.id IN $others RETURN o.id AS id, collect(DISTINCT coalesce(t.name, t.id)) AS topics`,
    { userId, others },
  );
}

/** Busy intervals: planned slots, accepted meets, and stored itinerary blocks (lunch and the like). */
export async function busySlots(userIds: string[], confId: string, exceptMeetId?: string): Promise<{ id: string; from: string; to: string }[]> {
  if (!userIds.length) return [];
  const [timed, stored] = await Promise.all([
    q<{ id: string; from: string; to: string }>(
      `MATCH (o:User)-[r:PLANS]->() WHERE o.id IN $ids AND r.conferenceId = $confId AND r.slotStart IS NOT NULL AND r.slotEnd IS NOT NULL
       RETURN o.id AS id, r.slotStart AS from, r.slotEnd AS to
       UNION ALL
       MATCH (o:User)-[:ATTENDS]->(mt:Meet)
       WHERE o.id IN $ids AND mt.conferenceId = $confId AND mt.status = 'accepted' AND mt.slotFrom IS NOT NULL AND mt.id <> $except
       RETURN o.id AS id, mt.slotFrom AS from, mt.slotTo AS to`,
      { ids: userIds, confId, except: exceptMeetId ?? "" },
    ),
    q<{ id: string; blocks: string | null }>(
      `MATCH (o:User) WHERE o.id IN $ids AND o.blocks IS NOT NULL RETURN o.id AS id, o.blocks AS blocks`,
      { ids: userIds },
    ),
  ]);
  const out = [...timed];
  for (const row of stored) {
    let parsed: unknown = row.blocks;
    if (typeof parsed === "string") {
      try { parsed = JSON.parse(parsed); } catch { continue; }
    }
    if (!Array.isArray(parsed)) continue;
    for (const b of parsed) {
      if (b && typeof b === "object" && typeof (b as { from?: unknown }).from === "string" && typeof (b as { to?: unknown }).to === "string") {
        out.push({ id: row.id, from: (b as { from: string }).from, to: (b as { to: string }).to });
      }
    }
  }
  return out;
}

// ---------- meet requests ----------

export interface MeetRow {
  id: string; fromUserId: string; toUserId: string; fromName: string; toName: string; note: string | null;
  proposal: string | null; status: string; at: string; conferenceId: string | null;
  /** Who made the latest counter (null: never countered). */
  counteredBy: string | null;
  /** Bumped on every update or transition; transitions apply only to the revision that was read. */
  rev: number;
}

const MEET_RETURN = `r.id AS id, a.id AS fromUserId, b.id AS toUserId, coalesce(a.name, a.id) AS fromName, coalesce(b.name, b.id) AS toName,
  r.note AS note, r.proposal AS proposal, r.status AS status, r.at AS at, r.conferenceId AS conferenceId, r.counteredBy AS counteredBy, coalesce(r.rev, 0) AS rev`;

export async function meetRequests(userId: string, confId: string): Promise<MeetRow[]> {
  return q<MeetRow>(
    `MATCH (a:User)-[r:REQUESTED_MEET]->(b:User) WHERE (a.id = $userId OR b.id = $userId) AND r.conferenceId = $confId
     RETURN ${MEET_RETURN} ORDER BY at DESC`,
    { userId, confId },
  );
}

export async function meetById(id: string): Promise<MeetRow | null> {
  const [r] = await q<MeetRow>(`MATCH (a:User)-[r:REQUESTED_MEET {id:$id}]->(b:User) RETURN ${MEET_RETURN}`, { id });
  return r ?? null;
}

export async function usersExist(ids: string[]): Promise<Map<string, string>> {
  const rows = await q<{ id: string; name: string }>(`MATCH (u:User) WHERE u.id IN $ids RETURN u.id AS id, coalesce(u.name, u.id) AS name`, { ids });
  return new Map(rows.map((r) => [r.id, r.name]));
}

export async function userWindows(ids: string[]): Promise<Map<string, { from: string | null; to: string | null }>> {
  if (!ids.length) return new Map();
  const rows = await q<{ id: string; from: string | null; to: string | null }>(
    `MATCH (u:User) WHERE u.id IN $ids RETURN u.id AS id, u.availFrom AS from, u.availTo AS to`,
    { ids },
  );
  return new Map(rows.map((r) => [r.id, { from: r.from, to: r.to }]));
}

/**
 * One open (pending/countered) request per pair and conference, either direction. A same-direction repeat updates it; a reverse
 * open request is returned as-is. Lookup and write are one graph query, so FalkorDB's per-query write lock makes it atomic:
 * two concurrent calls for the same pair cannot both create a request.
 */
export async function upsertMeetRequest(m: { id: string; from: string; to: string; note: string; proposal: string; at: string; confId: string }): Promise<MeetRow> {
  const [row] = await q<{ id: string }>(
    `MATCH (a:User {id:$from}), (b:User {id:$to})
     OPTIONAL MATCH (a)-[o:REQUESTED_MEET]-(b) WHERE o.conferenceId = $confId AND o.status IN ['pending', 'countered']
     WITH a, b, collect(o) AS open
     WITH a, b, [x IN open WHERE startNode(x).id = $from] AS mine, [x IN open WHERE startNode(x).id = $to] AS theirs
     FOREACH (x IN CASE WHEN size(theirs) = 0 THEN mine[0..1] ELSE [] END |
       SET x.note = $note, x.proposal = $proposal, x.status = 'pending', x.at = $at, x.counteredBy = null, x.rev = coalesce(x.rev, 0) + 1)
     FOREACH (_ IN CASE WHEN size(theirs) = 0 AND size(mine) = 0 THEN [1] ELSE [] END |
       CREATE (a)-[:REQUESTED_MEET {id:$id, note:$note, proposal:$proposal, status:'pending', at:$at, conferenceId:$confId, rev:1}]->(b))
     RETURN CASE WHEN size(theirs) > 0 THEN theirs[0].id WHEN size(mine) > 0 THEN mine[0].id ELSE $id END AS id`,
    m,
  );
  return (await meetById(row?.id ?? m.id))!;
}

/**
 * Accept, in one atomic query: the request becomes accepted and its Meet node (both users ATTENDS it, AT the proposed session,
 * DURING the conference) is written. Applies only while the request still has status `expect` and revision `rev`; false when it
 * changed meanwhile (a newer counter or update).
 */
export async function acceptMeet(m: {
  id: string; expect: string; rev: number; proposal: string | null; confId: string; slotFrom: string; slotTo: string; place: string | null; sessionId: string | null; title: string;
}): Promise<boolean> {
  const rows = await q<{ id: string }>(
    `MATCH (a:User)-[r:REQUESTED_MEET {id:$id}]->(b:User) WHERE r.status = $expect AND coalesce(r.rev, 0) = $rev
     SET r.status = 'accepted', r.proposal = coalesce($proposal, r.proposal), r.respondedAt = $at, r.rev = coalesce(r.rev, 0) + 1
     MERGE (mt:Meet {id:$id})
     SET mt.status = 'accepted', mt.at = $at, mt.slotFrom = $slotFrom, mt.slotTo = $slotTo, mt.place = $place, mt.conferenceId = $confId, mt.title = $title
     MERGE (a)-[:ATTENDS]->(mt) MERGE (b)-[:ATTENDS]->(mt)
     WITH mt
     OPTIONAL MATCH (mt)-[old:AT]->(:Session)
     WITH mt, collect(old) AS olds
     FOREACH (x IN olds | DELETE x)
     WITH mt
     OPTIONAL MATCH (c:Conference {id:$confId})
     FOREACH (_ IN CASE WHEN c IS NULL THEN [] ELSE [1] END | MERGE (mt)-[:DURING]->(c))
     WITH mt
     OPTIONAL MATCH (s:Session {id:$sessionId})
     FOREACH (_ IN CASE WHEN s IS NULL THEN [] ELSE [1] END | MERGE (mt)-[:AT]->(s))
     RETURN mt.id AS id`,
    { ...m, at: new Date().toISOString() },
  );
  return rows.length > 0;
}

/**
 * Decline or counter, in one atomic query: set the request status (and the counter proposal) and delete its Meet node if one
 * was accepted, so it leaves both plans. Applies only while the request still has status `expect` and revision `rev`; false when
 * it changed meanwhile.
 */
export async function closeMeet(m: { id: string; expect: string; rev: number; status: "declined" | "countered"; proposal: string | null; by: string }): Promise<boolean> {
  const rows = await q<{ id: string }>(
    `MATCH ()-[r:REQUESTED_MEET {id:$id}]->() WHERE r.status = $expect AND coalesce(r.rev, 0) = $rev
     SET r.status = $status, r.proposal = coalesce($proposal, r.proposal), r.respondedAt = $at, r.rev = coalesce(r.rev, 0) + 1,
         r.counteredBy = CASE WHEN $status = 'countered' THEN $by ELSE r.counteredBy END
     WITH r
     OPTIONAL MATCH (mt:Meet {id:$id})
     WITH r, collect(mt) AS meets
     FOREACH (x IN meets | DETACH DELETE x)
     RETURN r.id AS id`,
    { ...m, at: new Date().toISOString() },
  );
  return rows.length > 0;
}

type PlannedMeet = { id: string; slotStart: string | null; title: string };

/** Meets that were in the user's last stored plan for this conference (for plan diffs). One PlanMeets node per user and conference. */
export async function plannedMeets(userId: string, confId: string): Promise<PlannedMeet[]> {
  const [row] = await q<{ v: string | null }>(
    `MATCH (:User {id:$userId})-[:PLAN_MEETS]->(pm:PlanMeets {conferenceId:$confId}) RETURN pm.meets AS v LIMIT 1`, { userId, confId },
  );
  try {
    const v = row?.v ? JSON.parse(row.v) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** One write per user and conference, so plans for different conferences never overwrite each other. */
export async function setPlannedMeets(userId: string, confId: string, meets: PlannedMeet[]) {
  await q(
    `MATCH (u:User {id:$userId}) MERGE (u)-[:PLAN_MEETS]->(pm:PlanMeets {conferenceId:$confId}) SET pm.meets = $v`,
    { userId, confId, v: JSON.stringify(meets) },
  );
}

export interface AcceptedMeetRow extends RawPath { id: string; slotFrom: string; slotTo: string; place: string | null; otherName: string; otherUserId: string }

/** Accepted meets with a slot, for the itinerary; the path is user → Meet ← other user. */
export async function acceptedMeets(userId: string, confId: string): Promise<AcceptedMeetRow[]> {
  return q<AcceptedMeetRow>(
    `MATCH p = (u:User {id:$userId})-[:ATTENDS]->(mt:Meet)<-[:ATTENDS]-(o:User)
     WHERE mt.conferenceId = $confId AND mt.status = 'accepted' AND mt.slotFrom IS NOT NULL AND o <> u
     RETURN mt.id AS id, mt.slotFrom AS slotFrom, mt.slotTo AS slotTo, mt.place AS place, coalesce(o.name, o.id) AS otherName, o.id AS otherUserId, ${PATH("p")}`,
    { userId, confId },
  );
}

/** Everyone the user has logged as met, across conferences, newest first (My people). */
export async function metPeople(userId: string): Promise<MetPerson[]> {
  const rows = await q<{ id: string; name: string; title: string | null; company: string | null; companyId: string | null; conferenceId: string | null; conferenceName: string | null; at: string | null; links: string[] | null; photoUrl: string | null }>(
    `MATCH (u:User {id:$userId})-[m:MET]->(p:Person)
     OPTIONAL MATCH (p)-[:WORKS_AT]->(co:Company)
     OPTIONAL MATCH (c:Conference {id: m.conferenceId})
     RETURN p.id AS id, p.name AS name, p.title AS title, coalesce(co.name, p.company) AS company, co.id AS companyId,
            m.conferenceId AS conferenceId, c.name AS conferenceName, m.at AS at, p.links AS links, p.photoUrl AS photoUrl
     ORDER BY m.at DESC LIMIT 100`,
    { userId },
  );
  return rows.map((r) => ({
    person: { id: r.id, name: r.name, title: r.title ?? undefined, company: r.company ?? undefined, companyId: r.companyId ?? undefined, links: r.links?.length ? r.links : undefined, photoUrl: r.photoUrl ?? undefined },
    conferenceId: r.conferenceId ?? "", conferenceName: r.conferenceName ?? r.conferenceId ?? "", at: r.at ?? "",
  }));
}
