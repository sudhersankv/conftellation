// Pure itinerary builder: greedy clash resolution, time window, blocked time, booth fill in walking order.
import { ms } from "@/lib/time";

export interface TimedCandidate { id: string; start: string; end: string; score: number; pinned?: boolean; done?: boolean }
export interface BoothCandidate { id: string; score: number; order?: number; hall?: string; pinned?: boolean; done?: boolean }
export interface Block { from: string; to: string; label: string; id?: string }

export interface ItineraryInput {
  sessions: TimedCandidate[];
  booths: BoothCandidate[];
  window?: { from: string | null; to: string | null } | null;
  blocks?: Block[];
  boothMinutes?: number; // default 10
  maxBooths?: number; // default 4
  day: { from: string; to: string }; // conference hours for this day
  now?: string; // booths are only filled after now (while the day is running)
}

export type Slot =
  | { kind: "session"; id: string; from: string; to: string }
  | { kind: "booth"; id: string; from: string; to: string }
  | { kind: "block"; id: string; label: string; from: string; to: string };

const overlaps = (a: [number, number], b: [number, number]) => a[0] < b[1] && b[0] < a[1];

/** Format an epoch-ms time with the same offset as `like` (keeps every time in the venue offset, e.g. -07:00). */
export function fmtLike(t: number, like: string): string {
  return fmt(t, like);
}

function fmt(t: number, like: string): string {
  const m = like.match(/([+-])(\d{2}):(\d{2})$/);
  if (!m) return new Date(t).toISOString();
  const off = (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
  return `${new Date(t + off * 60_000).toISOString().slice(0, 19)}${m[0]}`;
}

export function buildItinerary(input: ItineraryInput): Slot[] {
  const boothMs = (input.boothMinutes ?? 10) * 60_000;
  const lo = Math.max(ms(input.day.from), input.window?.from ? ms(input.window.from) : -Infinity);
  const hi = Math.min(ms(input.day.to), input.window?.to ? ms(input.window.to) : Infinity);
  const blocks = (input.blocks ?? []).map((b, i) => ({ ...b, id: b.id ?? `block-${i}`, span: [ms(b.from), ms(b.to)] as [number, number] }));
  const taken: [number, number][] = blocks.map((b) => b.span);
  const slots: Slot[] = blocks.map((b) => ({ kind: "block", id: b.id, label: b.label, from: b.from, to: b.to }));

  // done and pinned sessions are fixed; then greedy by score within the window and around blocks
  const fixed = input.sessions.filter((s) => s.done || s.pinned);
  const rest = input.sessions.filter((s) => !s.done && !s.pinned).sort((a, b) => b.score - a.score || ms(a.start) - ms(b.start));
  for (const s of fixed) {
    taken.push([ms(s.start), ms(s.end)]);
    slots.push({ kind: "session", id: s.id, from: s.start, to: s.end });
  }
  for (const s of rest) {
    const span: [number, number] = [ms(s.start), ms(s.end)];
    if (span[0] < lo || span[1] > hi) continue;
    if (taken.some((t) => overlaps(t, span))) continue;
    taken.push(span);
    slots.push({ kind: "session", id: s.id, from: s.start, to: s.end });
  }

  // booths: top N by score (pinned/done always in), then walk them in hall/booth order through the gaps
  const ranked = [...input.booths].filter((b) => b.score > 0 || b.pinned).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.score - a.score);
  const chosen = ranked.slice(0, Math.max(input.maxBooths ?? 4, ranked.filter((b) => b.pinned || b.done).length));
  const walk = chosen.sort((a, b) => (a.hall ?? "").localeCompare(b.hall ?? "") || (a.order ?? 0) - (b.order ?? 0));
  const like = input.day.from;
  const busy = [...taken].sort((a, b) => a[0] - b[0]);
  const nowMs = input.now ? ms(input.now) : -Infinity;
  let cursor = nowMs > lo && nowMs < hi ? nowMs : lo;
  let i = 0;
  const gaps: [number, number][] = [];
  for (const [s, e] of busy) {
    if (e <= cursor) continue;
    if (s > cursor) gaps.push([cursor, Math.min(s, hi)]);
    cursor = Math.max(cursor, e);
  }
  if (cursor < hi) gaps.push([cursor, hi]);
  for (const [gs, ge] of gaps) {
    let t = gs;
    while (i < walk.length && t + boothMs <= ge) {
      slots.push({ kind: "booth", id: walk[i].id, from: fmt(t, like), to: fmt(t + boothMs, like) });
      t += boothMs;
      i++;
    }
  }
  return slots.sort((a, b) => ms(a.from) - ms(b.from));
}
