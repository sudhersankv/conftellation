// Onboarding: User (+ Person via IS), ATTENDS, goals/problems linked to conference topics, availability; then the first plan.
import { q } from "@/lib/falkor";
import type { Goal, OnboardingRequest, OnboardingResponse, Problem } from "@/lib/types";
import { slug, topicId } from "@/lib/agents/scout/normalized";
import { runPlanner } from "@/lib/agents/planner";
import { setWindow, topicsForText, upsertGoal, upsertProblem } from "@/lib/queries/steer";

export class UnknownConference extends Error {}

/** Goals are ranked by the order given: 1, 0.8, 0.6, then 0.5. */
const weightAt = (i: number) => Math.max(0.5, Math.round((1 - 0.2 * i) * 10) / 10);

/**
 * Person id for an onboarded attendee. The user id is percent-encoded so two ids that slug
 * the same (`alex-kim` and `alex kim`) do not MERGE onto one Person.
 */
export function attendeePersonId(name: string, userId: string): string {
  const who = slug(name) || "user";
  const token = encodeURIComponent(userId).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${who}@user-${token}`;
}

export async function onboard(userId: string, body: OnboardingRequest, now?: string): Promise<OnboardingResponse> {
  const [conf] = await q<{ id: string }>(`MATCH (c:Conference {id:$id}) RETURN c.id AS id`, { id: body.confId });
  if (!conf) throw new UnknownConference(`conference ${body.confId} not found`);
  const name = body.name?.trim() || userId;
  await q(
    `MERGE (u:User {id:$userId}) ON CREATE SET u.name = $name
     SET u.openTo = $openTo
     WITH u
     OPTIONAL MATCH (u)-[:IS]->(existing:Person)
     WITH u, existing
     FOREACH (_ IN CASE WHEN existing IS NULL THEN [1] ELSE [] END |
       MERGE (p:Person {id:$pid}) ON CREATE SET p.name = u.name, p.via = 'user', p.source = 'conftellations', p.collectedAt = $at
       SET p.userId = u.id, p.openTo = $openTo
       MERGE (u)-[:IS]->(p)
       SET u.personId = $pid)
     WITH u MATCH (c:Conference {id:$confId}) MERGE (u)-[:ATTENDS]->(c)`,
    { userId, name, openTo: body.openTo ?? [], pid: attendeePersonId(name, userId), at: new Date().toISOString(), confId: body.confId },
  );
  if (body.availFrom !== undefined || body.availTo !== undefined) await setWindow(userId, body.availFrom ?? null, body.availTo ?? null);

  const goals: Goal[] = [];
  for (const [i, g] of (body.goals ?? []).entries()) {
    if (!g.text?.trim()) continue;
    const topics = await linkTopics(g.text, g.topics, body.confId);
    const goal: Goal = { id: `g-${userId}-${slug(g.text).slice(0, 40)}`, text: g.text.trim(), kind: g.kind ?? "learn", weight: weightAt(i), topics };
    await upsertGoal(userId, goal);
    goals.push(goal);
  }
  const problems: Problem[] = [];
  for (const text of body.problems ?? []) {
    if (!text?.trim()) continue;
    const p: Problem = { id: `pr-${userId}-${slug(text).slice(0, 40)}`, text: text.trim(), topics: await linkTopics(text, undefined, body.confId) };
    await upsertProblem(userId, p);
    problems.push(p);
  }
  await runPlanner(userId, body.confId, { now, write: true });
  return { goals, problems };
}

/** Explicit topics that exist in the graph, plus topics inferred from the text at this conference. */
async function linkTopics(text: string, given: string[] | undefined, confId: string): Promise<string[]> {
  const explicit = (given ?? []).map(topicId).filter(Boolean);
  const known = explicit.length
    ? (await q<{ id: string }>(`MATCH (t:Topic) WHERE t.id IN $ids RETURN t.id AS id`, { ids: explicit })).map((r) => r.id)
    : [];
  const inferred = await topicsForText([text, ...explicit].join(". "), confId);
  return [...new Set([...known, ...inferred])];
}
