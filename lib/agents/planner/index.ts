// Planner: candidates (Cypher) → scores → itinerary → PLANS edges → PlanResponse + diff vs. the previous plan.
// score = goalScore + 0.1·(extra topics) + 0.5·boosted + 0.3·vectorSim  (+ people/booth bonuses below)
import type { Booth, GoalPlan, Goal, GoalKind, ItinerarySlot, OpenTo, Person, PlanDiff, PlanItem, PlanResponse, Session, SessionKind, Via, WhyPath } from "@/lib/types";
import { ms } from "@/lib/time";
import { acceptedMeets, plannedMeets, setPlannedMeets } from "@/lib/queries/network";
import { buildItinerary, type Block } from "./itinerary";
import {
  boostedTopicPaths, boothPaths, boothsByIds, conferenceDay, peopleByIds, personPaths, sessionPaths, sessionSimilarity, sessionsByIds, userState, writePlans,
  type BoothRow, type PersonRow, type RawPath, type SessionRow, type UserState,
} from "@/lib/queries/plan";

const PER_GOAL = { sessions: 5, people: 4, booths: 4 };
const round = (x: number) => Math.round(x * 100) / 100;
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export class NotFound extends Error {}

interface Cand { id: string; score: number; goalId: string | null; goalIds: Set<string>; why: WhyPath[] }

function whyOf(path: RawPath, text: string): Omit<WhyPath, "id"> {
  return { text, nodes: path.nodes, edges: path.edges };
}
/** The UI renders why text verbatim in one line (≲110 chars): drop the goal clause first, then the quoted title. */
export function fitWhy(text: string, max = 110): string {
  if (text.length <= max) return text;
  const noGoal = text.replace(/, your goal '[^']*'$/, "");
  if (noGoal.length <= max) return noGoal;
  const noTitle = noGoal.replace(/ \('[^']*'\)/, "");
  return noTitle.length <= max ? noTitle : noTitle.slice(0, max - 1) + "…";
}
const nameOf = (path: RawPath, label: string) => path.nodes.find((n) => n.label === label)?.name ?? "";

export interface PlannerResult { plan: PlanResponse; diff: PlanDiff }

export async function runPlanner(userId: string, confId: string, opts: { now?: string; write?: boolean } = {}): Promise<PlannerResult> {
  const state = await userState(userId, confId);
  if (!state) throw new NotFound(`user ${userId} not found`);
  const now = opts.now ?? new Date().toISOString();
  const [sPaths, sims, pPaths, bPaths, day, tBoosts, meets, prevMeets] = await Promise.all([
    sessionPaths(userId, confId), sessionSimilarity(userId, confId), personPaths(userId, confId), boothPaths(userId, confId), conferenceDay(confId),
    boostedTopicPaths(userId, confId), acceptedMeets(userId, confId), plannedMeets(userId, confId),
  ]);
  const meetById = new Map(meets.map((m) => [m.id, m]));
  const goalById = new Map(state.goals.map((g) => [g.id, g]));
  const boosted = new Map(state.boosted.map((b) => [b.id, b]));
  const done = new Set([...state.doneIds, ...state.metToday]);

  const sessions = scoreSessions(state, sPaths, sims, boosted, goalById, tBoosts);
  const people = scorePeople(state, pPaths, boosted, goalById);
  const booths = scoreBooths(state, bPaths, boosted, goalById);

  const [sRows, pRows, bRows] = await Promise.all([
    sessionsByIds(sessions.map((c) => c.id)), peopleByIds(people.map((c) => c.id)), boothsByIds(booths.map((c) => c.id)),
  ]);
  const sMap = new Map(sRows.map((r) => [r.id, r]));
  const bMap = new Map(bRows.map((r) => [r.id, r]));
  const pMap = new Map(pRows.map((r) => [r.id, r]));
  applyIntentBonus(state, people, pMap);

  // ----- itinerary -----
  const blocks: Block[] = [
    ...(state.blocks ? (JSON.parse(state.blocks) as Block[]).map(({ from, to, label }) => ({ from, to, label })) : []),
    ...meets.map((m) => ({ id: m.id, from: m.slotFrom, to: m.slotTo, label: "meet" })),
  ];
  const slots = day.from && day.to
    ? buildItinerary({
        day: { from: day.from, to: day.to },
        window: { from: state.availFrom, to: state.availTo },
        blocks,
        now,
        boothMinutes: state.boothMinutes ?? 10,
        sessions: sessions.filter((c) => sMap.has(c.id)).map((c) => ({
          id: c.id, start: sMap.get(c.id)!.start, end: sMap.get(c.id)!.end, score: c.score,
          pinned: boosted.get(c.id)?.pinned, done: done.has(c.id),
        })),
        booths: booths.filter((c) => bMap.has(c.id)).map((c) => ({
          id: c.id, score: c.score, order: bMap.get(c.id)!.order ?? undefined, hall: bMap.get(c.id)!.hall ?? undefined,
          pinned: boosted.get(c.id)?.pinned, done: done.has(c.id),
        })),
      })
    : [];

  // ----- items -----
  let pathN = 0;
  const withIds = (why: WhyPath[]) => why.map((w) => ({ ...w, text: fitWhy(w.text), id: `p${++pathN}` }));
  const sessionItem = (c: Cand): PlanItem => {
    const r = sMap.get(c.id)!;
    return {
      type: "session", id: c.id, title: r.title, subtitle: r.room ?? undefined, goalId: c.goalId ?? undefined, score: round(c.score),
      status: done.has(c.id) ? "done" : "planned", why: withIds(c.why), collectedAt: r.collectedAt ?? undefined, source: r.source ?? undefined,
      session: toSession(r),
    };
  };
  const personItem = (c: Cand): PlanItem => {
    const r = pMap.get(c.id)!;
    const person = toPerson(r);
    return {
      type: "person", id: c.id, title: r.name, subtitle: [r.title, r.company].filter(Boolean).join(" @ ") || undefined,
      goalId: c.goalId ?? undefined, score: round(c.score), status: done.has(c.id) ? "done" : "planned", why: withIds(c.why),
      collectedAt: r.collectedAt ?? undefined, source: r.source ?? undefined, person,
    };
  };
  const boothItem = (c: Cand): PlanItem => {
    const r = bMap.get(c.id)!;
    return {
      type: "booth", id: c.id, title: r.companyName, subtitle: r.label, goalId: c.goalId ?? undefined, score: round(c.score),
      status: done.has(c.id) ? "done" : "planned", why: withIds(c.why), collectedAt: r.collectedAt ?? undefined, source: r.source ?? undefined,
      booth: toBooth(r),
    };
  };

  const sCand = new Map(sessions.map((c) => [c.id, c]));
  const bCand = new Map(booths.map((c) => [c.id, c]));
  const itinerary: ItinerarySlot[] = slots.map((s) => {
    if (s.kind === "session") return { from: s.from, to: s.to, item: sessionItem(sCand.get(s.id)!) };
    if (s.kind === "booth") return { from: s.from, to: s.to, item: boothItem(bCand.get(s.id)!) };
    const mt = meetById.get(s.id);
    if (mt) {
      const why = withIds([{ text: `You agreed to meet ${mt.otherName}`, nodes: mt.nodes, edges: mt.edges } as WhyPath]);
      return { from: s.from, to: s.to, item: { type: "meet", id: mt.id, title: `Meet ${mt.otherName}`, subtitle: mt.place ?? undefined, score: 0, status: "planned", why } };
    }
    return { from: s.from, to: s.to, item: { type: "block", id: s.id, title: s.label, score: 0, status: "planned", why: [] } };
  });

  const byGoal: GoalPlan[] = state.goals.map((g) => ({
    goal: toGoal(g),
    sessions: sessions.filter((c) => c.goalIds.has(g.id) && sMap.has(c.id)).slice(0, PER_GOAL.sessions).map(sessionItem),
    people: people.filter((c) => c.goalIds.has(g.id) && pMap.has(c.id)).slice(0, PER_GOAL.people).map(personItem),
    booths: booths.filter((c) => c.goalIds.has(g.id) && bMap.has(c.id)).slice(0, PER_GOAL.booths).map(boothItem),
  }));

  const plan: PlanResponse = {
    confId, userId, itinerary, byGoal, generatedAt: new Date().toISOString(),
    now: nowTarget(state, itinerary, sMap, bMap, now),
  };

  // ----- PLANS edges + diff -----
  const edges = [
    ...itinerary.filter((s) => s.item.type !== "block" && s.item.type !== "meet").map((s) => ({
      id: s.item.id, goalId: s.item.goalId ?? null, score: s.item.score, status: s.item.status, slotStart: s.from, slotEnd: s.to,
    })),
    ...byGoal.flatMap((g) => g.people).map((p) => ({ id: p.id, goalId: p.goalId ?? null, score: p.score, status: p.status, slotStart: null, slotEnd: null })),
  ];
  const unique = [...new Map(edges.map((e) => [e.id, e])).values()];
  // Accepted meets are not PLANS edges; the last plan's meets are stored on the user so the diff can add/remove/move them too.
  const meetItems = itinerary.filter((s) => s.item.type === "meet").map((s) => ({ id: s.item.id, slotStart: s.from as string | null, title: s.item.title }));
  const diff = diffPlans([...state.prevPlans, ...prevMeets.map((m) => ({ ...m, type: "Meet" }))], [...unique, ...meetItems], plan);
  if (opts.write !== false) await Promise.all([writePlans(userId, confId, unique), setPlannedMeets(userId, confId, meetItems)]);
  return { plan, diff };
}

// ---------- scoring ----------

function scoreSessions(
  state: UserState, rows: Awaited<ReturnType<typeof sessionPaths>>, sims: { goalId: string; sessionId: string; sim: number }[],
  boosted: Map<string, { pinned: boolean }>, goals: Map<string, UserState["goals"][number]>, topicBoosts: Awaited<ReturnType<typeof boostedTopicPaths>> = [],
): Cand[] {
  const boostOf = new Map<string, RawPath>();
  for (const r of topicBoosts) if (!boostOf.has(r.sessionId)) boostOf.set(r.sessionId, r);
  const boostWhy = (p: RawPath) => whyOf(p, `You asked for more ${nameOf(p, "Topic")}`) as WhyPath;
  const by = new Map<string, Map<string, { topics: Set<string>; path: RawPath }>>();
  for (const r of rows) {
    const g = by.get(r.sessionId) ?? new Map();
    const e = g.get(r.goalId) ?? { topics: new Set<string>(), path: r };
    e.topics.add(r.topicId);
    g.set(r.goalId, e);
    by.set(r.sessionId, g);
  }
  const simOf = new Map<string, number>();
  for (const s of sims) simOf.set(s.sessionId, Math.max(simOf.get(s.sessionId) ?? 0, s.sim));
  const out: Cand[] = [];
  for (const [sid, gmap] of by) {
    const entries = [...gmap.entries()].map(([gid, e]) => ({ gid, e, w: goals.get(gid)?.weight ?? 1 }))
      .sort((a, b) => b.w * (1 + 0.1 * b.e.topics.size) - a.w * (1 + 0.1 * a.e.topics.size));
    const topics = new Set(entries.flatMap((x) => [...x.e.topics]));
    const tb = boostOf.get(sid);
    const score = entries.reduce((s, x) => s + x.w, 0) + 0.1 * (topics.size - 1) + (boosted.has(sid) ? 0.5 : 0) + 0.3 * (simOf.get(sid) ?? 0) + (tb ? 0.6 : 0);
    const why = entries.slice(0, 2).map((x) => whyOf(x.e.path, `Matches your goal '${goals.get(x.gid)?.text}' via topic ${nameOf(x.e.path, "Topic")}`)) as WhyPath[];
    if (tb) why.splice(1, 0, boostWhy(tb));
    out.push({ id: sid, score, goalId: entries[0].gid, goalIds: new Set(entries.map((x) => x.gid)), why: why.slice(0, 2) });
  }
  for (const [sid, p] of boostOf) {
    if (by.has(sid)) continue;
    out.push({ id: sid, score: 0.6 + (boosted.has(sid) ? 0.5 : 0) + 0.3 * (simOf.get(sid) ?? 0), goalId: null, goalIds: new Set(), why: [boostWhy(p)] });
  }
  return out.sort((a, b) => b.score - a.score);
}

function scorePeople(
  state: UserState, rows: Awaited<ReturnType<typeof personPaths>>, boosted: Map<string, { pinned: boolean }>,
  goals: Map<string, UserState["goals"][number]>,
): Cand[] {
  const by = new Map<string, { goals: Map<string, number>; whys: Map<string, Omit<WhyPath, "id">>; bonus: number }>();
  for (const r of rows) {
    const e = by.get(r.personId) ?? { goals: new Map(), whys: new Map(), bonus: 0 };
    if (r.via === "met_before") {
      const when = r.metAt ? ` in ${MONTH[new Date(r.metAt).getUTCMonth()]}` : "";
      if (!e.whys.has("met")) {
        e.whys.set("met", whyOf(r, `You met ${nameOf(r, "Person")} at ${r.conferenceName}${when}; ${nameOf(r, "Person").split(" ")[0]} speaks here on '${nameOf(r, "Session")}'`));
        e.bonus += 0.4;
      }
    } else if (r.goalId) {
      const g = goals.get(r.goalId);
      const w = (g?.weight ?? 1) + (r.via === "speaker" ? 0.2 : 0.1);
      e.goals.set(r.goalId, Math.max(e.goals.get(r.goalId) ?? 0, w));
      const key = `${r.via}:${r.goalId}`;
      if (!e.whys.has(key)) {
        const p = nameOf(r, "Person"), t = nameOf(r, "Topic");
        e.whys.set(key, whyOf(r, r.via === "speaker"
          ? `${p} speaks on ${t} ('${nameOf(r, "Session")}'), your goal '${g?.text}'`
          : `${p} works at ${nameOf(r, "Company")}, which offers ${t}, your goal '${g?.text}'`));
      }
    }
    by.set(r.personId, e);
  }
  const out: Cand[] = [];
  for (const [pid, e] of by) {
    const ranked = [...e.goals.entries()].sort((a, b) => b[1] - a[1]);
    const goalId = ranked[0]?.[0] ?? state.goals[0]?.id ?? null;
    const score = ranked.reduce((s, [, w]) => s + w, 0) + e.bonus + (boosted.has(pid) ? 0.5 : 0);
    const whys = [...e.whys.entries()].sort(([a], [b]) => Number(b === "met") - Number(a === "met")).map(([, w]) => w).slice(0, 2) as WhyPath[];
    out.push({ id: pid, score, goalId, goalIds: new Set(ranked.map(([g]) => g)), why: whys });
  }
  return out.sort((a, b) => b.score - a.score);
}

function scoreBooths(
  state: UserState, rows: Awaited<ReturnType<typeof boothPaths>>, boosted: Map<string, { pinned: boolean }>,
  goals: Map<string, UserState["goals"][number]>,
): Cand[] {
  const problems = new Map(state.problems.map((p) => [p.id, p]));
  const goalForProblem = (pid: string) => {
    const topics = new Set(problems.get(pid)?.topics ?? []);
    return [...goals.values()].map((g) => ({ g, n: g.topics.filter((t) => topics.has(t)).length })).sort((a, b) => b.n - a.n)[0]?.g.id ?? null;
  };
  const by = new Map<string, { w: number; goalId: string | null; goalIds: Set<string>; topics: Set<string>; offer?: Omit<WhyPath, "id">; met?: Omit<WhyPath, "id"> }>();
  for (const r of rows) {
    const isProblem = r.sourceKind === "Problem";
    const w = isProblem ? 1 : goals.get(r.sourceId)?.weight ?? 1;
    const e = by.get(r.boothId) ?? { w: 0, goalId: null, goalIds: new Set<string>(), topics: new Set<string>() };
    const co = nameOf(r, "Company"), t = nameOf(r, "Topic");
    if (r.metPersonId) {
      if (!e.met) e.met = whyOf(r, `You met ${nameOf(r, "Person")}, who works at ${co}`);
    } else {
      e.topics.add(t);
      const gid = isProblem ? goalForProblem(r.sourceId) : r.sourceId;
      if (gid) e.goalIds.add(gid);
      if (w > e.w || (isProblem && w === e.w)) {
        e.w = w;
        e.goalId = isProblem ? goalForProblem(r.sourceId) : r.sourceId;
        e.offer = whyOf(r, isProblem ? `${co} offers ${t}, your team's problem` : `${co} offers ${t}, your goal '${goals.get(r.sourceId)?.text}'`);
      }
    }
    by.set(r.boothId, e);
  }
  const out: Cand[] = [];
  for (const [bid, e] of by) {
    if (!e.offer) continue;
    const score = e.w + 0.1 * (e.topics.size - 1) + (e.met ? 0.4 : 0) + (boosted.has(bid) ? 0.5 : 0);
    out.push({ id: bid, score, goalId: e.goalId, goalIds: e.goalIds, why: [e.offer, ...(e.met ? [e.met] : [])] as WhyPath[] });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Goal kind ↔ person intent: a "job" goal favours people who are hiring, a "hire" goal favours job hunters. */
const INTENT: Partial<Record<GoalKind, OpenTo>> = { job: "hiring", hire: "job_hunting", buy: "buying" };

function applyIntentBonus(state: UserState, people: Cand[], pMap: Map<string, PersonRow>) {
  for (const c of people) {
    const openTo = pMap.get(c.id)?.openTo ?? [];
    const goal = state.goals.find((g) => INTENT[g.kind as GoalKind] && openTo.includes(INTENT[g.kind as GoalKind]!) && c.goalIds.has(g.id));
    if (!goal) continue;
    c.score += 0.3;
    c.goalId = goal.id;
    const label = openTo.includes("hiring") ? "is hiring" : openTo.includes("job_hunting") ? "is open to a new role" : "is looking to buy";
    const w = c.why.find((x) => x.nodes.some((n) => n.id === goal.id)) ?? c.why[0];
    if (w) {
      w.text = `${pMap.get(c.id)!.name.split(" ")[0]} ${label}. ${w.text}`;
      c.why = [w, ...c.why.filter((x) => x !== w)];
    }
  }
  people.sort((a, b) => b.score - a.score);
}

// ---------- now / diff ----------

function nowTarget(state: UserState, itinerary: ItinerarySlot[], sMap: Map<string, SessionRow>, bMap: Map<string, BoothRow>, now: string): PlanResponse["now"] {
  const t = ms(now);
  const last = state.checkins.find((c) => ms(c.at) <= t);
  if (last) {
    const s = sMap.get(last.targetId);
    if (s && ms(s.end) > t) return { targetId: s.id, title: s.title, type: "session", from: s.start, to: s.end };
    const b = bMap.get(last.targetId);
    if (b && t - ms(last.at) < 20 * 60_000) return { targetId: b.id, title: `${b.label} · ${b.companyName}`, type: "booth" };
  }
  const slot = itinerary.find((s) => s.item.type === "session" && ms(s.from) <= t && t < ms(s.to));
  return slot ? { targetId: slot.item.id, title: slot.item.title, type: "session", from: slot.from, to: slot.to } : null;
}

function diffPlans(prev: UserState["prevPlans"], next: { id: string; slotStart: string | null }[], plan: PlanResponse): PlanDiff {
  const items = new Map<string, PlanItem>();
  plan.itinerary.forEach((s) => items.set(s.item.id, s.item));
  plan.byGoal.forEach((g) => g.people.forEach((p) => items.set(p.id, p)));
  const typeOf = (t: string) => (t === "Session" ? "session" : t === "Booth" ? "booth" : t === "Meet" ? "meet" : "person") as PlanItem["type"];
  const prevMap = new Map(prev.map((p) => [p.id, p]));
  const nextMap = new Map(next.map((n) => [n.id, n]));
  return {
    added: next.filter((n) => !prevMap.has(n.id)).map((n) => ({ id: n.id, title: items.get(n.id)?.title ?? n.id, type: items.get(n.id)?.type ?? "session" })),
    removed: prev.filter((p) => !nextMap.has(p.id)).map((p) => ({ id: p.id, title: p.title, type: typeOf(p.type) })),
    moved: next
      .filter((n) => prevMap.has(n.id) && n.slotStart && prevMap.get(n.id)!.slotStart && ms(n.slotStart) !== ms(prevMap.get(n.id)!.slotStart!))
      .map((n) => ({ id: n.id, title: items.get(n.id)?.title ?? n.id, type: items.get(n.id)?.type ?? "session", from: prevMap.get(n.id)!.slotStart!, to: n.slotStart! })),
  };
}

// ---------- row → contract ----------

const via = (v: string | null) => (v ?? undefined) as Via | undefined;

export function toSession(r: SessionRow): Session {
  return {
    id: r.id, conferenceId: r.conferenceId, title: r.title, abstract: r.abstract ?? undefined, kind: (r.kind ?? "other") as SessionKind,
    start: r.start, end: r.end, room: r.room ?? undefined, url: r.url ?? undefined, topics: r.topics,
    speakers: r.speakers.filter((s) => s.id).map((s) => ({ id: s.id, name: s.name, title: s.title ?? undefined, company: s.company ?? undefined })),
    source: r.source ?? undefined, collectedAt: r.collectedAt ?? undefined, via: via(r.via),
  };
}

export function toPerson(r: PersonRow): Person {
  return {
    id: r.id, name: r.name, title: r.title ?? undefined, company: r.company ?? undefined, companyId: r.companyId ?? undefined,
    bio: r.bio ?? undefined, userId: r.userId ?? undefined, openTo: (r.openTo ?? undefined) as OpenTo[] | undefined,
    source: r.source ?? undefined, collectedAt: r.collectedAt ?? undefined, via: via(r.via),
  };
}

export function toBooth(r: BoothRow): Booth {
  return {
    id: r.id, conferenceId: r.conferenceId, companyId: r.companyId, label: r.label, hall: r.hall ?? undefined, order: r.order ?? undefined,
    company: {
      id: r.companyId, name: r.companyName, description: r.description ?? undefined, website: r.website ?? undefined,
      sponsorTier: r.sponsorTier ?? undefined, topics: r.topics, source: r.source ?? undefined, collectedAt: r.collectedAt ?? undefined, via: via(r.via),
    },
  };
}

function toGoal(g: UserState["goals"][number]): Goal {
  return { id: g.id, text: g.text, kind: g.kind as GoalKind, weight: g.weight, topics: g.topics };
}
