// Intros, network (polled every ~5 s: two parallel query rounds), meet requests and responses.
import type {
  IntrosResponse, MeetProposal, MeetRequest, MeetRespondBody, NetworkResponse, NetworkUser, OpenTo, WarmIntro, WhyPath,
} from "@/lib/types";
import { fitWhy, toPerson } from "@/lib/agents/planner";
import { fmtLike } from "@/lib/agents/planner/itinerary";
import { conferenceDay, peopleByIds, sessionsByIds, type RawPath } from "@/lib/queries/plan";
import {
  busySlots, meetById, meetRequests, metBefore, networkOverlap, setMeetStatus, sharedGoalTopics, upsertMeetRequest, usersExist,
  warmIntros, writeMeet, type MeetRow,
} from "@/lib/queries/network";
import { ms } from "@/lib/time";

const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const first = (name: string) => name.split(" ")[0];

function mergePaths(...ps: RawPath[]): RawPath {
  const nodes = new Map<string, RawPath["nodes"][number]>();
  const edges = new Map<string, RawPath["edges"][number]>();
  for (const p of ps) {
    p.nodes.forEach((n) => nodes.set(n.id, n));
    p.edges.forEach((e) => edges.set(`${e.from}|${e.type}|${e.to}`, e));
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

// ---------- intros ----------

export async function getIntros(userId: string, confId: string): Promise<IntrosResponse> {
  const [warm, before] = await Promise.all([warmIntros(userId, confId), metBefore(userId, confId)]);
  const ids = [...new Set([...warm.flatMap((w) => [w.personId, w.viaPersonId]), ...before.map((b) => b.personId)])];
  const people = new Map((await peopleByIds(ids)).map((r) => [r.id, toPerson(r)]));
  const intros: WarmIntro[] = [];
  let n = 0;
  const seen = new Set<string>();
  for (const w of warm) {
    if (seen.has(`w:${w.personId}`) || !people.has(w.personId)) continue;
    seen.add(`w:${w.personId}`);
    const why = w.isProblem ? "your team's problem" : "your goal";
    const text = fitWhy(`${first(w.viaName)}, who you met, was at ${w.personName}'s talk; ${first(w.personName)} speaks on ${w.topic}, ${why}`);
    const path: WhyPath = { id: `p${++n}`, text, ...mergePaths(w, { nodes: w.tailNodes, edges: w.tailEdges }) };
    intros.push({ kind: "warm_intro", text, person: people.get(w.personId)!, via: people.get(w.viaPersonId), path });
  }
  for (const b of before) {
    if (seen.has(`m:${b.personId}`) || !people.has(b.personId)) continue;
    seen.add(`m:${b.personId}`);
    const when = b.metAt ? ` in ${MONTH[new Date(b.metAt).getUTCMonth()]}` : "";
    const text = fitWhy(`You met ${b.personName} at ${b.conferenceName}${when}; ${b.speaksOn ? `${first(b.personName)} speaks here on '${b.speaksOn}'` : `${first(b.personName)} is here today`}`);
    intros.push({ kind: "met_before", text, person: people.get(b.personId)!, path: { id: `p${++n}`, text, nodes: b.nodes, edges: b.edges } });
  }
  return { intros };
}

// ---------- network ----------

type Span = [number, number];
const MIN_GAP = 20 * 60_000;
const SLOT = 30 * 60_000;

/** Gaps (≥20 min, after now) where both users are free, inside both windows and the conference day. First 3, each ≤30 min. */
export function freeSlots(input: {
  day: { from: string; to: string }; now: string; windows: { from: string | null; to: string | null }[]; busy: { from: string; to: string }[];
}): { from: string; to: string }[] {
  let lo = Math.max(ms(input.day.from), ms(input.now), ...input.windows.map((w) => (w.from ? ms(w.from) : -Infinity)));
  const hi = Math.min(ms(input.day.to), ...input.windows.map((w) => (w.to ? ms(w.to) : Infinity)));
  lo = Math.ceil(lo / (5 * 60_000)) * 5 * 60_000;
  const busy: Span[] = input.busy.map((b) => [ms(b.from), ms(b.to)] as Span).filter(([a, b]) => b > lo && a < hi).sort((a, b) => a[0] - b[0]);
  const out: { from: string; to: string }[] = [];
  let cursor = lo;
  for (const [a, b] of [...busy, [hi, hi] as Span]) {
    if (a - cursor >= MIN_GAP) out.push({ from: fmtLike(cursor, input.day.from), to: fmtLike(Math.min(a, cursor + SLOT), input.day.from) });
    cursor = Math.max(cursor, b);
    if (out.length === 3) break;
  }
  return out;
}

export async function getNetwork(userId: string, confId: string, now: string): Promise<NetworkResponse> {
  const [rows, meets, day, mine] = await Promise.all([
    networkOverlap(userId, confId), meetRequests(userId, confId), conferenceDay(confId), busySlots([userId], confId),
  ]);
  const others = rows.map((r) => r.id);
  const [topics, theirs] = await Promise.all([sharedGoalTopics(userId, others), busySlots(others, confId)]);
  const topicsBy = new Map(topics.map((t) => [t.id, t.topics]));
  const users: NetworkUser[] = rows
    .map((r) => {
      const shared = r.shared.map((s) => ({ id: s.id, title: s.title, type: (s.label === "Booth" ? "booth" : "session") as "session" | "booth" }));
      const sharedTopics = topicsBy.get(r.id) ?? [];
      const free = day.from && day.to
        ? freeSlots({ day: { from: day.from, to: day.to }, now, windows: [{ from: r.availFrom, to: r.availTo }], busy: [...mine, ...theirs.filter((b) => b.id === r.id)] })
        : [];
      return {
        user: { id: r.id, name: r.name, personId: r.personId ?? undefined, availFrom: r.availFrom, availTo: r.availTo, openTo: (r.openTo ?? []) as OpenTo[] },
        overlap: shared.length, shared, sharedTopics, freeSlots: free,
      };
    })
    .filter((u) => u.overlap > 0 || u.sharedTopics.length > 0)
    .sort((a, b) => b.overlap + 0.5 * b.sharedTopics.length - (a.overlap + 0.5 * a.sharedTopics.length))
    .slice(0, 20);
  const all = meets.map(toMeetRequest);
  return { users, incoming: all.filter((m) => m.toUserId === userId), outgoing: all.filter((m) => m.fromUserId === userId) };
}

// ---------- meets ----------

export class MeetError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function toMeetRequest(r: MeetRow): MeetRequest {
  let proposal: MeetProposal = {};
  try { proposal = r.proposal ? JSON.parse(r.proposal) : {}; } catch { /* keep {} */ }
  return {
    id: r.id, fromUserId: r.fromUserId, toUserId: r.toUserId, fromName: r.fromName, toName: r.toName,
    note: r.note ?? "", proposal, status: r.status as MeetRequest["status"], at: r.at,
  };
}

export async function requestMeet(fromUserId: string, body: { toUserId: string; note: string; proposal: MeetProposal; confId: string }): Promise<MeetRequest> {
  if (fromUserId === body.toUserId) throw new MeetError("can't request a meet with yourself", 400);
  const users = await usersExist([fromUserId, body.toUserId]);
  if (!users.has(fromUserId) || !users.has(body.toUserId)) throw new MeetError("user not found", 404);
  const at = new Date().toISOString();
  const row = await upsertMeetRequest({
    id: `meet-${Date.parse(at).toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    from: fromUserId, to: body.toUserId, note: body.note ?? "", proposal: JSON.stringify(body.proposal ?? {}), at, confId: body.confId,
  });
  return toMeetRequest(row);
}

export async function respondMeet(meetId: string, body: MeetRespondBody, now: string): Promise<MeetRequest> {
  const row = await meetById(meetId);
  if (!row) throw new MeetError("meet request not found", 404);
  const req = toMeetRequest(row);
  if (body.action === "decline") {
    await setMeetStatus(meetId, "declined");
  } else if (body.action === "counter") {
    if (!body.proposal) throw new MeetError("counter needs a proposal", 400);
    await setMeetStatus(meetId, "countered", JSON.stringify(body.proposal));
  } else {
    const proposal = body.proposal ?? req.proposal;
    const confId = row.conferenceId ?? "";
    const slot = await meetSlot(proposal, confId, [req.fromUserId, req.toUserId], now);
    await setMeetStatus(meetId, "accepted", body.proposal ? JSON.stringify(body.proposal) : undefined);
    await writeMeet({
      id: meetId, from: req.fromUserId, to: req.toUserId, confId, slotFrom: slot?.from ?? null, slotTo: slot?.to ?? null,
      place: proposal.place ?? slot?.place ?? null, sessionId: proposal.sessionId ?? null, title: `${req.fromName} × ${req.toName}`,
    });
  }
  return toMeetRequest((await meetById(meetId))!);
}

/** Explicit slot; else 20 min right after the proposed session; else the first slot both are free. */
async function meetSlot(p: MeetProposal, confId: string, users: string[], now: string): Promise<{ from: string; to: string; place?: string } | null> {
  if (p.slot?.from && p.slot?.to) return { from: p.slot.from, to: p.slot.to };
  if (p.sessionId) {
    const [s] = await sessionsByIds([p.sessionId]);
    if (s) return { from: s.end, to: fmtLike(ms(s.end) + 20 * 60_000, s.end), place: s.room ? `Outside ${s.room}` : undefined };
  }
  const day = await conferenceDay(confId);
  if (!day.from || !day.to) return null;
  const busy = await busySlots(users, confId);
  return freeSlots({ day: { from: day.from, to: day.to }, now, windows: [], busy })[0] ?? null;
}
