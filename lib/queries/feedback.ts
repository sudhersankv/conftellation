// "Not for me" / "more like this" on a card → SKIPPED / BOOSTED edge (the opposite edge is removed).
import { q } from "@/lib/falkor";

export async function writeFeedback(userId: string, targetId: string, kind: "skip" | "boost"): Promise<boolean> {
  const [add, drop] = kind === "skip" ? ["SKIPPED", "BOOSTED"] : ["BOOSTED", "SKIPPED"];
  const rows = await q<{ id: string }>(
    `MATCH (u:User {id:$userId}), (x {id:$targetId}) WHERE x:Session OR x:Booth OR x:Person OR x:Topic
     OPTIONAL MATCH (u)-[old:${drop}]->(x) DELETE old
     MERGE (u)-[r:${add}]->(x) SET r.at = $at
     RETURN x.id AS id`,
    { userId, targetId, at: new Date().toISOString() },
  );
  return rows.length > 0;
}
