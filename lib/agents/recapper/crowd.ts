// Crowd summary for a session: the Recapper over its shared moments, each sentence cited to a moment id.
// Stored as a Summary node on the Session (precomputed by the seed in DEMO_MODE); reused while the set of shared moments is unchanged.
import { z } from "zod";
import { hasLLM, structured } from "@/lib/llm";
import { isoInZone, PT } from "@/lib/time";
import type { CommunityResponse, Moment, MomentKind } from "@/lib/types";
import { readSummary, writeSummary } from "@/lib/queries/brief";
import { sessionMoments, type MomentRow } from "@/lib/queries/community";
import { parseSections } from "./cite";

type Crowd = NonNullable<CommunityResponse["crowdSummary"]>;
const MAX = 5;
const LLM_TIMEOUT_MS = 12_000;
const BIN_MS = 2 * 60_000;

export function toMoment(r: MomentRow): Moment {
  return {
    id: r.id, userId: r.userId, conferenceId: r.conferenceId, kind: r.kind as MomentKind, at: r.at, text: r.text ?? undefined,
    mediaUrl: r.mediaUrl ?? undefined, shared: Boolean(r.shared), targetId: r.targetId ?? undefined, targetTitle: r.targetTitle ?? undefined,
    personId: r.personId ?? undefined, topics: r.topics,
  };
}

/** Hot moments: 2-minute bins over every moment time at a session (counts only, no content). */
export function hotMoments(times: string[]): CommunityResponse["hotMoments"] {
  const bins = new Map<number, number>();
  for (const t of times) {
    const ms = Date.parse(t);
    if (Number.isNaN(ms)) continue;
    const b = Math.floor(ms / BIN_MS) * BIN_MS;
    bins.set(b, (bins.get(b) ?? 0) + 1);
  }
  return [...bins.entries()].sort(([a], [b]) => a - b).map(([b, count]) => ({ binStart: isoInZone(new Date(b), PT), count }));
}

/** Template: identical notes grouped, most-noted first, one sentence per note citing its earliest moment. */
export function templateCrowd(notes: Pick<MomentRow, "id" | "text">[]): Crowd["lines"] {
  const by = new Map<string, { text: string; ids: string[] }>();
  for (const n of notes) {
    const text = n.text?.trim();
    if (!text) continue;
    const k = text.toLowerCase();
    const e = by.get(k) ?? { text, ids: [] };
    e.ids.push(n.id);
    by.set(k, e);
  }
  return [...by.values()]
    .sort((a, b) => b.ids.length - a.ids.length)
    .slice(0, MAX)
    .map((e) => ({ text: `${e.ids.length > 1 ? `${e.ids.length} attendees noted` : "An attendee noted"}: "${e.text.replace(/\.$/, "")}".`, momentId: e.ids[0] }));
}

const Schema = z.object({ lines: z.array(z.string()) });
const SYSTEM = `Summarise what attendees noted during one conference session, in at most ${MAX} sentences.
Use ONLY the notes given. Each note has an id like p3. End every sentence with the id of a note it came from, like [p3].
Merge notes that say the same thing. Third person ("Attendees noted…"), no names, no buzzwords, no emoji, at most 22 words per sentence.`;

export async function writeCrowd(title: string, notes: MomentRow[]): Promise<Crowd | null> {
  const withText = notes.filter((n) => n.text?.trim());
  if (!withText.length) return null;
  let lines = templateCrowd(withText);
  if (hasLLM()) {
    const ids = withText.map((n, i) => ({ pid: `p${i + 1}`, n }));
    try {
      const out = await Promise.race([
        structured(Schema, SYSTEM, JSON.stringify({ session: title, notes: ids.map(({ pid, n }) => ({ id: pid, note: n.text })) }), "crowd"),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("llm timeout")), LLM_TIMEOUT_MS)),
      ]);
      const toMoment = new Map(ids.map(({ pid, n }) => [pid, n.id]));
      const parsed = parseSections([{ title: "crowd", lines: out.lines }], new Set(toMoment.keys()))[0]?.lines ?? [];
      if (parsed.length) lines = parsed.slice(0, MAX).map((l) => ({ text: l.text, momentId: toMoment.get(l.pathId)! }));
    } catch (e) {
      console.warn("[recapper] crowd LLM failed, using template:", (e as Error).message);
    }
  }
  return { lines, updatedAt: new Date().toISOString() };
}

const crowdId = (sessionId: string) => `crowd:${sessionId}`;
const fingerprint = (notes: MomentRow[]) => notes.map((n) => n.id).sort().join(",");

/** Stored summary if still fresh, else recompute and store. Null when nobody shared anything. */
export async function getCrowd(session: { id: string; title: string; conferenceId: string }, shared?: MomentRow[]): Promise<Crowd | null> {
  const notes = shared ?? (await sessionMoments(session.id, { shared: true }));
  if (!notes.some((n) => n.text?.trim())) return null;
  const stored = await readSummary(crowdId(session.id));
  if (stored) {
    const s = JSON.parse(stored.json) as Crowd & { fingerprint?: string };
    if (s.fingerprint === fingerprint(notes)) return { lines: s.lines, updatedAt: s.updatedAt };
  }
  const crowd = await writeCrowd(session.title, notes);
  if (crowd) {
    await writeSummary({
      id: crowdId(session.id), kind: "crowd", ownerId: session.id, conferenceId: session.conferenceId,
      json: JSON.stringify({ ...crowd, fingerprint: fingerprint(notes) }), generatedAt: crowd.updatedAt,
    });
  }
  return crowd;
}

/** Seed-time precompute (DEMO_MODE): crowd summaries for every session with shared notes. */
export async function precomputeCrowds(sessions: { id: string; title: string; conferenceId: string }[]) {
  const out = await Promise.all(sessions.map(async (s) => {
    const notes = await sessionMoments(s.id, { shared: true });
    const crowd = await writeCrowd(s.title, notes);
    if (crowd) {
      await writeSummary({
        id: crowdId(s.id), kind: "crowd", ownerId: s.id, conferenceId: s.conferenceId,
        json: JSON.stringify({ ...crowd, fingerprint: fingerprint(notes) }), generatedAt: crowd.updatedAt,
      });
    }
    return crowd ? 1 : 0;
  }));
  return out.reduce<number>((a, b) => a + b, 0);
}
