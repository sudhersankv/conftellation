// "Not for me" / "more like this" on a card → SKIPPED / BOOSTED edge (the opposite edge is removed).
// Feedback is scoped to a conference: the edge carries `conferenceId` as part of its identity, so feedback on the same
// person at two conferences is two edges. Topics are a global preference (any opposite edge is dropped).
import { q } from "@/lib/falkor";

/** False when the user does not attend `conferenceId`, or the target is unknown or not part of that conference. */
export async function writeFeedback(userId: string, targetId: string, kind: "skip" | "boost", conferenceId: string): Promise<boolean> {
  const [add, drop] = kind === "skip" ? ["SKIPPED", "BOOSTED"] : ["BOOSTED", "SKIPPED"];
  const rows = await q<{ id: string }>(
    `MATCH (u:User {id:$userId})-[:ATTENDS]->(c:Conference {id:$conferenceId})
     MATCH (x {id:$targetId})
     WHERE x:Topic
        OR (x:Session AND (c)-[:HAS_SESSION]->(x))
        OR (x:Booth AND (c)-[:HAS_BOOTH]->(x))
        OR (x:Person AND (
             (x)-[:SPEAKS_AT]->(:Session)<-[:HAS_SESSION]-(c)
          OR (x)-[:WORKS_AT]->(:Company)-[:SPONSORS]->(c)
          OR (x)-[:WORKS_AT]->(:Company)-[:HAS_BOOTH]->(:Booth)<-[:HAS_BOOTH]-(c)
          OR (u)-[:CAPTURED]->(:Moment {conferenceId:$conferenceId})-[:MET]->(x)
          OR (u)-[:MET {conferenceId:$conferenceId}]->(x)
          OR (x)<-[:IS]-(:User)-[:ATTENDS]->(c)))
     OPTIONAL MATCH (u)-[old:${drop}]->(x) WHERE x:Topic OR old.conferenceId IS NULL OR old.conferenceId = $conferenceId
     DELETE old
     WITH DISTINCT u, x
     MERGE (u)-[r:${add} {conferenceId:$conferenceId}]->(x) SET r.at = $at
     RETURN x.id AS id`,
    { userId, targetId, conferenceId, at: new Date().toISOString() },
  );
  return rows.length > 0;
}
