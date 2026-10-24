// Scribe: a capture becomes a Moment in the graph in one round of queries (<1 s), so the Sky can pulse right away.
// Attach: explicit target, else the latest check-in still running, else the planned session containing now (same rule as PlanResponse.now).
// Topics: cheap synchronous tags (existing conference topics named in the text, then the target's topics); the LLM
// refines them and the moment text is embedded in the background.
import { z } from "zod";
import { embedOne, hasLLM, structured } from "@/lib/llm";
import { isoInZone, ms, PT } from "@/lib/time";
import { companySlug, personId as personIdOf, topicId } from "@/lib/agents/scout/normalized";
import {
  addMentions, conferenceTopics, goalForMoment, momentById, nowInputs, personExists, setMomentEmbedding, targetById, targetTopics,
  upsertMetPerson, userExists, writeMoment, type TargetRow,
} from "@/lib/queries/moments";
import type { CreateMomentResponse, MomentKind } from "@/lib/types";

export class ScribeError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export const MOMENT_KINDS: MomentKind[] = ["checkin", "note", "photo", "met", "voice"];
const BOOTH_STAY_MS = 20 * 60_000;
const MAX_TOPICS = 3;

export interface CaptureInput {
  userId: string; confId: string; kind: MomentKind; now?: string; text?: string; mediaUrl?: string; targetId?: string;
  personId?: string; newPersonName?: string; newPersonCompany?: string; shared?: boolean;
  /** Use as the Moment id (the client's `clientId`), so a retried capture MERGEs onto the same Moment. */
  momentId?: string;
}

/** Background work still running (topic refinement, embedding). Tests await it; the route doesn't. */
const pending = new Set<Promise<unknown>>();
export const scribeIdle = () => Promise.allSettled([...pending]).then(() => undefined);
function background(p: Promise<unknown>) {
  const t = p.catch((e) => console.error("scribe background:", e)).finally(() => pending.delete(t));
  pending.add(t);
}

export const newMomentId = () => `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** Where an untargeted capture attaches at `now`. */
export async function attachTarget(userId: string, confId: string, now: string): Promise<TargetRow | null> {
  const t = ms(now);
  const { checkins, slots } = await nowInputs(userId, confId);
  const last = checkins.find((c) => ms(c.at) <= t);
  if (last) {
    if (last.label === "Session" && last.end && ms(last.end) > t) return last;
    if (last.label === "Booth" && t - ms(last.at) < BOOTH_STAY_MS) return last;
  }
  return slots.find((s) => ms(s.slotStart) <= t && t < ms(s.slotEnd)) ?? null;
}

export async function capture(input: CaptureInput): Promise<CreateMomentResponse> {
  const { userId, confId, kind } = input;
  const nowIso = isoInZone(new Date(input.now ?? Date.now()), PT);
  const text = input.text?.trim() || null;
  if (kind === "met" && !input.personId && !input.newPersonName?.trim()) throw new ScribeError("met needs personId or newPersonName");
  if ((kind === "note" || kind === "voice") && !text && !input.mediaUrl) throw new ScribeError(`${kind} needs text`);
  if (kind === "photo" && !input.mediaUrl) throw new ScribeError("photo needs a file");

  const [exists, explicit, confTopics, knownPerson] = await Promise.all([
    userExists(userId),
    input.targetId ? targetById(input.targetId) : Promise.resolve(null),
    conferenceTopics(confId),
    input.personId ? personExists(input.personId) : Promise.resolve(false),
  ]);
  if (!exists) throw new ScribeError(`user ${userId} not found`, 404);
  if (input.targetId && !explicit) throw new ScribeError(`target ${input.targetId} not found`, 404);
  if (explicit?.conferenceId && explicit.conferenceId !== confId) throw new ScribeError(`target ${explicit.id} is not at ${confId}`);
  if (input.personId && !knownPerson) throw new ScribeError(`person ${input.personId} not found`, 404);

  const target = explicit ?? (await attachTarget(userId, confId, nowIso));
  if (kind === "checkin" && !target) throw new ScribeError("checkin needs a targetId (nothing is on your plan right now)");

  let personId = input.personId ?? "";
  if (!personId && input.newPersonName?.trim()) {
    const name = input.newPersonName.trim();
    const company = input.newPersonCompany?.trim() || null;
    personId = personIdOf(name, company ?? undefined);
    await upsertMetPerson({ id: personId, name, company, companySlug: company ? companySlug(company) : null, at: nowIso });
  }

  const topics = quickTopics(text, confTopics, target ? await targetTopics(target.id) : []);
  const id = input.momentId ?? newMomentId();
  const ok = await writeMoment({
    id, userId, confId, kind, at: nowIso, text, mediaUrl: input.mediaUrl ?? null, shared: input.shared ?? false,
    targetId: target?.id ?? "", personId, topics,
  });
  if (!ok) throw new ScribeError(`conference ${confId} not found`, 404);

  const ids = [target?.id, personId].filter(Boolean) as string[];
  const [moment, goalId] = await Promise.all([momentById(id), goalForMoment(userId, id, ids)]);
  if (!moment) throw new Error(`moment ${id} was not written`);

  background(enrich(id, text, moment.topics, confTopics));
  const lit = [...new Set([moment.id, moment.targetId, moment.personId, goalId].filter(Boolean) as string[])];
  return { moment, lit };
}

/** Existing topic names that appear in the text first, then the target's own topics; at most 3. */
export function quickTopics(text: string | null, confTopics: { id: string; name: string }[], targetTopicIds: string[]): string[] {
  const hay = ` ${(text ?? "").toLowerCase().replace(/[^a-z0-9/+.\- ]+/g, " ")} `;
  const named = confTopics.filter((t) => t.id.length > 2 && hay.includes(` ${t.id} `)).map((t) => t.id);
  return [...new Set([...named, ...targetTopicIds])].slice(0, MAX_TOPICS);
}

const TopicPick = z.object({ topics: z.array(z.string()).max(MAX_TOPICS) });

async function enrich(id: string, text: string | null, have: string[], confTopics: { id: string; name: string }[]) {
  if (!text) return;
  const jobs: Promise<unknown>[] = [embedOne(text).then((v) => setMomentEmbedding(id, v))];
  if (hasLLM() && have.length < MAX_TOPICS && confTopics.length) {
    const known = new Map(confTopics.map((t) => [t.id, t.id]));
    jobs.push(
      structured(
        TopicPick,
        "Tag a conference note with 1-3 topics. Use only names from the given list, exactly as written. Return fewer if unsure.",
        `Topics: ${confTopics.map((t) => t.name).join(", ")}\n\nNote: ${text.slice(0, 1500)}`,
        "topics",
      ).then(({ topics }) => {
        const ids = topics.map(topicId).filter((t) => known.has(t) && !have.includes(t)).slice(0, MAX_TOPICS - have.length);
        return addMentions(id, ids);
      }),
    );
  }
  await Promise.all(jobs);
}
