// Q11: flatten the user's graph into the Sky. Every node a plan/brief why-path mentions is included (same ids),
// so the UI can trace any WhyPath; capture `lit` ids (moment, target, person, goal) are always present.
import { runPlanner } from "@/lib/agents/planner";
import {
  skyBase, skyDust, skyMet, skyMoments, skyOthers, skyRelevantCompanies, skySharedMoments, skySkipped, skySummaryPaths,
} from "@/lib/queries/constellation";
import type { ConstellationResponse, EdgeType, NodeLabel, PlanItem, SkyLink, SkyNode, SkyNodeType, WhyPath } from "@/lib/types";

export const MAX_NODES = 800;
export const MAX_DUST_PER_CONF = 300;
const MAX_OTHER_USERS = 12;
const LABEL_MAX = 48;
const RELEVANT_FIT = 0.6; // a company offering a goal/problem topic, with no planner score of its own

const TYPE: Partial<Record<NodeLabel, SkyNodeType>> = {
  Conference: "conference", Session: "session", Person: "person", Company: "company", Booth: "booth", Topic: "topic",
  User: "user", Goal: "goal", Problem: "problem", Moment: "moment", Meet: "meet",
};
const short = (s: string, n = LABEL_MAX) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const round2 = (x: number) => Math.round(x * 100) / 100;
// Higher wins when the same id shows up in two conferences. Planned beats a mere "met" so the current plan stays primary.
const STATE_RANK: Record<SkyNode["state"], number> = { dust: 0, skipped: 1, unplanned: 2, planned: 3, anchor: 3, done: 4 };

/**
 * Keep the most important stars when the sky is over the cap. Lower tier is kept first: anchors, captures (newest first),
 * why-path nodes, plan, skips, other users, dust. `groups` lists the stars a star cannot be shown without (a capture's
 * target and person): a star is kept only together with its whole group, or not at all.
 */
export function capNodes(list: SkyNode[], tier: ReadonlyMap<string, number>, max = MAX_NODES, groups: ReadonlyMap<string, string[]> = new Map()): SkyNode[] {
  const sorted = [...list].sort((a, b) => (tier.get(a.id) ?? 9) - (tier.get(b.id) ?? 9) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (sorted.length <= max) return sorted;
  const present = new Set(sorted.map((n) => n.id));
  const keep = new Set<string>();
  for (const n of sorted) {
    if (keep.size >= max) break;
    if (keep.has(n.id)) continue;
    const need = [n.id, ...(groups.get(n.id) ?? [])].filter((id) => present.has(id) && !keep.has(id));
    if (keep.size + new Set(need).size > max) continue;
    for (const id of need) keep.add(id);
  }
  return sorted.filter((n) => keep.has(n.id));
}

const time = (at: string | undefined) => (at ? Date.parse(at) : NaN);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** Interleave lists (a, b, a, b, ...) so a shared cap takes from each. */
const interleave = <T>(...lists: T[][]): T[] => {
  const out: T[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
};

export const emptyConstellation = (): ConstellationResponse => ({ nodes: [], links: [], coverage: [] });

export async function buildConstellation(userId: string, confId: string | null, opts: { now?: string } = {}): Promise<ConstellationResponse> {
  const base = await skyBase(userId, confId);
  if (!base) return emptyConstellation();
  const confIds = base.conferences.map((c) => c.id);
  if (!confIds.length) return emptyConstellation();

  const [plans, moments, met, skipped, summaries, relevant] = await Promise.all([
    Promise.all(confIds.map((c) => runPlanner(userId, c, { write: false, now: opts.now }).then((r) => r.plan))),
    skyMoments(userId, confIds),
    skyMet(userId, confIds),
    skySkipped(userId, confIds),
    skySummaryPaths(userId, confIds),
    skyRelevantCompanies(userId, confIds),
  ]);

  const nodes = new Map<string, SkyNode>();
  const links = new Map<string, SkyLink>();
  const tier = new Map<string, number>();
  const pin = (id: string, t: number) => { const p = tier.get(id); if (p === undefined || t < p) tier.set(id, t); };
  const add = (n: SkyNode) => {
    const prev = nodes.get(n.id);
    if (!prev) { nodes.set(n.id, { ...n }); return; }
    if (n.conferenceId && n.conferenceId !== prev.conferenceId) {
      const ids = new Set(prev.conferenceIds ?? (prev.conferenceId ? [prev.conferenceId] : []));
      if (prev.conferenceId) ids.add(prev.conferenceId);
      ids.add(n.conferenceId);
      if (ids.size > 1) prev.conferenceIds = [...ids];
    }
    if (STATE_RANK[n.state] > STATE_RANK[prev.state]) {
      prev.state = n.state;
      if (n.conferenceId) prev.conferenceId = n.conferenceId;
      if (n.fit !== undefined) prev.fit = n.fit;
      if (n.goalId) prev.goalId = n.goalId;
      if (n.at) prev.at = n.at;
      if (n.label) prev.label = n.label;
    } else if (n.state === prev.state) {
      if (n.fit !== undefined && (prev.fit === undefined || n.fit > prev.fit)) prev.fit = n.fit;
      // same state seen again (e.g. a person met at two conferences): the newer encounter is the primary one
      if (time(n.at) > time(prev.at) || (prev.at === undefined && n.at !== undefined)) {
        prev.at = n.at;
        if (n.conferenceId) prev.conferenceId = n.conferenceId;
      }
    }
    const dst = prev as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(n)) if (k !== "conferenceIds" && v !== undefined && dst[k] === undefined) dst[k] = v;
  };
  const link = (source: string, target: string, type: EdgeType) => {
    if (source === target) return;
    links.set(`${source}|${target}|${type}`, { source, target, type });
  };
  const confFallback = confIds[0];

  // ----- anchors -----
  add({ id: userId, type: "user", label: base.name ?? userId, state: "anchor" });
  for (const c of base.conferences) {
    add({ id: c.id, type: "conference", label: c.name, state: "anchor", conferenceId: c.id });
    link(userId, c.id, "ATTENDS");
  }
  // A goal belongs to its own conference if it has one, else to every in-scope conference it is planned at (newest first).
  const goalConfs = (g: (typeof base.goals)[number]) => {
    const inScope = confIds.filter((c) => c === g.own || g.planned.includes(c));
    if (g.own && inScope.includes(g.own)) inScope.unshift(...inScope.splice(inScope.indexOf(g.own), 1));
    return inScope.length ? inScope : [confFallback];
  };
  const goalConf = (g: (typeof base.goals)[number]) => goalConfs(g)[0];
  for (const g of base.goals) {
    const cs = goalConfs(g);
    add({ id: g.id, type: "goal", label: g.text, state: "anchor", goalId: g.id, conferenceId: cs[0], ...(cs.length > 1 ? { conferenceIds: cs } : {}), fit: clamp01(g.weight) });
    link(userId, g.id, "HAS_GOAL");
  }
  // Privacy: only this user's own goals, problems and captures (plus captures another user shared) may appear;
  // other users only as `isOtherUser` stars.
  const own = new Set([...base.goals.map((g) => g.id), ...base.problems.map((p) => p.id), ...moments.map((m) => m.id)]);
  const pathMoments = [...plans.flatMap((p) => [...p.itinerary.map((s) => s.item), ...p.byGoal.flatMap((g) => [...g.sessions, ...g.people, ...g.booths])])
    .flatMap((i) => i.why), ...summaries.flatMap((s) => s.paths)]
    .flatMap((w) => w.nodes).filter((n) => n.label === "Moment" && !own.has(n.id)).map((n) => n.id);
  for (const id of await skySharedMoments([...new Set(pathMoments)])) own.add(id);
  const goalForTopics = (topics: string[]) => {
    const ranked = base.goals.map((g) => ({ g, n: g.topics.filter((t) => topics.includes(t)).length })).filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n || b.g.weight - a.g.weight);
    return ranked[0]?.g.id;
  };
  for (const p of base.problems) {
    const goalId = goalForTopics(p.topics);
    const g = base.goals.find((x) => x.id === goalId);
    add({ id: p.id, type: "problem", label: p.text, state: "anchor", goalId, conferenceId: g ? goalConf(g) : confFallback });
    link(userId, p.id, "HAS_PROBLEM");
  }
  for (const n of nodes.values()) if (n.state === "anchor") pin(n.id, -1);

  // ----- plan items + every node on their why paths -----
  const coverage = new Map<string, { covered: Set<string>; planned: Set<string> }>();
  const pathNodes = (paths: WhyPath[], conferenceId: string, goalId?: string) => {
    for (const w of paths) {
      for (const n of w.nodes) {
        const type = TYPE[n.label];
        if (!type) continue;
        if ((n.label === "Goal" || n.label === "Problem" || n.label === "Moment") && !own.has(n.id)) continue;
        pin(n.id, n.label === "User" ? 4 : 1);
        if (nodes.has(n.id)) {
          if (n.label !== "User") {
            const prev = nodes.get(n.id)!;
            add({ id: n.id, type: prev.type, label: prev.label, state: prev.state, conferenceId });
          }
          continue;
        }
        if (n.label === "User") {
          add({ id: n.id, type: "user", label: (n.name ?? n.id).split(" ")[0], state: "planned", isOtherUser: true, goalId });
          continue;
        }
        const anchor = type === "goal" || type === "problem" || type === "conference";
        add({
          id: n.id, type, label: short(n.name ?? n.id), state: anchor ? "anchor" : type === "topic" || type === "company" ? "planned" : "dust",
          goalId: type === "topic" ? goalForTopics([n.id]) ?? goalId : goalId, conferenceId,
        });
      }
      for (const e of w.edges) link(e.from, e.to, e.type);
    }
  };
  plans.forEach((plan, i) => {
    const conferenceId = confIds[i];
    const items = new Map<string, { item: PlanItem; at?: string }>();
    for (const s of plan.itinerary) if (s.item.type !== "block") items.set(s.item.id, { item: s.item, at: s.from });
    for (const g of plan.byGoal) for (const it of [...g.sessions, ...g.people, ...g.booths]) if (!items.has(it.id)) items.set(it.id, { item: it });
    // fit is relative within a type: person scores sum several goals and would otherwise dim every session.
    const max = new Map<string, number>();
    for (const { item } of items.values()) max.set(item.type, Math.max(max.get(item.type) ?? 0, item.score));
    for (const { item, at } of items.values()) {
      const top = max.get(item.type) ?? 0;
      add({
        id: item.id, type: item.type as SkyNodeType, label: short(item.type === "booth" && item.subtitle ? `${item.subtitle} · ${item.title}` : item.title),
        state: item.status === "done" ? "done" : item.status === "skipped" ? "skipped" : "planned",
        goalId: item.goalId, conferenceId, fit: top > 0 ? round2(clamp01(item.score / top)) : undefined, at: item.status === "done" ? undefined : at,
      });
      pin(item.id, 2);
      link(item.goalId ?? userId, item.id, "PLANS");
    }
    for (const g of plan.byGoal) {
      const c = coverage.get(g.goal.id) ?? { covered: new Set(), planned: new Set() };
      for (const it of [...g.sessions, ...g.people, ...g.booths]) {
        c.planned.add(it.id);
        if (it.status === "done") c.covered.add(it.id);
      }
      coverage.set(g.goal.id, c);
    }
    for (const { item } of items.values()) pathNodes(item.why, conferenceId, item.goalId);
  });

  // ----- moments, their targets and the people met -----
  const goalOfTarget = (id: string | null) => (id ? nodes.get(id)?.goalId : undefined);
  const groups = new Map<string, string[]>(); // a capture is shown with its target and person, or not at all
  const checkedIn = new Set<string>();
  // oldest first, so the newest encounter ends up primary; capped newest first (tier 0 + rank < 1)
  moments.forEach((m, i) => pin(m.id, i / (moments.length + 1)));
  for (const m of [...moments].reverse()) {
    const goalId = goalOfTarget(m.targetId) ?? goalOfTarget(m.personId) ?? goalForTopics(m.topics);
    add({ id: m.id, type: "moment", label: short(m.text ?? m.kind, 40), state: "done", at: m.at, goalId, conferenceId: m.conferenceId });
    groups.set(m.id, [m.targetId, m.personId].filter((x): x is string => !!x));
    link(userId, m.id, "CAPTURED");
    if (m.targetId && m.targetLabel && TYPE[m.targetLabel]) {
      const t = nodes.get(m.targetId);
      if (!t || t.state === "dust") nodes.delete(m.targetId);
      add({ id: m.targetId, type: TYPE[m.targetLabel]!, label: short(m.targetTitle ?? m.targetId), state: "unplanned", goalId, conferenceId: m.conferenceId });
      const target = nodes.get(m.targetId)!;
      if (m.kind === "checkin" && !checkedIn.has(m.targetId)) {
        // replay at the (first) check-in, not at the itinerary slot
        checkedIn.add(m.targetId);
        if (target.state === "planned") target.state = "done";
        target.at = m.at;
      } else target.at ??= m.at;
      pin(m.targetId, 0);
      link(m.id, m.targetId, "AT");
    }
    if (m.personId) {
      if (nodes.get(m.personId)?.state === "dust") nodes.delete(m.personId);
      add({ id: m.personId, type: "person", label: short(m.personName ?? m.personId), state: "unplanned", goalId, conferenceId: m.conferenceId, at: m.at });
      pin(m.personId, 0);
      link(m.id, m.personId, "MET");
    }
  }
  for (const p of met) {
    if (nodes.get(p.id)?.state === "dust") nodes.delete(p.id);
    add({ id: p.id, type: "person", label: short(p.name ?? p.id), state: "unplanned", conferenceId: p.conferenceId, at: p.at ?? undefined });
    pin(p.id, 0);
    link(userId, p.id, "MET");
  }

  // ----- brief / trip report paths -----
  for (const s of summaries) pathNodes(s.paths, s.conferenceId);

  // ----- relevant companies: sponsors/exhibitors offering a topic of a goal or problem (booth or not) -----
  for (const r of relevant) {
    add({ id: r.topicId, type: "topic", label: short(r.topicName), state: "planned", goalId: r.ownerId, conferenceId: r.conferenceId });
    add({ id: r.companyId, type: "company", label: short(r.companyName), state: "planned", goalId: r.ownerId, conferenceId: r.conferenceId, fit: RELEVANT_FIT });
    pin(r.topicId, 2);
    pin(r.companyId, 2);
    link(r.ownerId, r.topicId, "ABOUT");
    link(r.companyId, r.topicId, "OFFERS");
    if (r.boothId) {
      add({ id: r.boothId, type: "booth", label: short(r.boothLabel ? `${r.companyName} · ${r.boothLabel}` : r.companyName), state: "planned", goalId: r.ownerId, conferenceId: r.conferenceId });
      pin(r.boothId, 2);
      link(r.companyId, r.boothId, "HAS_BOOTH");
    }
  }

  // ----- skipped (hidden in the Sky, present so steer can animate them out) -----
  for (const x of skipped) {
    const type = TYPE[x.label];
    if (!type) continue;
    const prev = nodes.get(x.id);
    if (prev) {
      if (prev.state === "done" || prev.state === "unplanned" || prev.type === "moment") continue;
      prev.state = "skipped";
    } else add({ id: x.id, type, label: short(x.name ?? x.id), state: "skipped", conferenceId: x.conferenceId ?? confFallback });
    pin(x.id, 3);
  }

  // ----- Q7: other users on the same stars -----
  const mine = [...nodes.values()].filter((n) => ["session", "booth", "person"].includes(n.type) && n.state !== "dust" && n.state !== "skipped").map((n) => n.id);
  const others = await skyOthers(userId, mine, confIds);
  const byUser = new Map<string, { name: string | null; targets: Map<string, "PLANS" | "AT"> }>();
  for (const o of others) {
    const e = byUser.get(o.userId) ?? { name: o.name, targets: new Map() };
    if (e.targets.get(o.targetId) !== "AT") e.targets.set(o.targetId, o.type);
    byUser.set(o.userId, e);
  }
  const topUsers = [...byUser.entries()].sort((a, b) => b[1].targets.size - a[1].targets.size).slice(0, MAX_OTHER_USERS);
  for (const [oid, e] of topUsers) {
    if (nodes.has(oid)) continue;
    const firstTarget = nodes.get([...e.targets.keys()][0]);
    add({ id: oid, type: "user", label: (e.name ?? oid).split(" ")[0], state: "planned", isOtherUser: true, goalId: firstTarget?.goalId });
    pin(oid, 4);
    for (const [tid, type] of e.targets) link(oid, tid, type);
  }

  // ----- dust: the rest of each conference, capped -----
  let budget = MAX_NODES - nodes.size;
  for (const c of confIds) {
    if (budget <= 0) break;
    const cap = Math.min(MAX_DUST_PER_CONF, budget);
    const dust = await skyDust(c, cap + nodes.size);
    const extra = interleave<{ id: string; label: string; type: "session" | "booth"; edge: "HAS_SESSION" | "HAS_BOOTH" }>(
      dust.sessions.filter((d) => !nodes.has(d.id)).map((s) => ({ ...s, type: "session" as const, edge: "HAS_SESSION" as const })),
      dust.booths.filter((d) => !nodes.has(d.id)).map((b) => ({ ...b, type: "booth" as const, edge: "HAS_BOOTH" as const })),
    ).slice(0, cap);
    for (const d of extra) {
      add({ id: d.id, type: d.type, label: short(d.label ?? d.id, 32), state: "dust", conferenceId: c });
      pin(d.id, 5);
      link(c, d.id, d.edge);
    }
    budget -= extra.length;
  }

  const out = capNodes([...nodes.values()], tier, MAX_NODES, groups);
  const ids = new Set(out.map((n) => n.id));
  return {
    nodes: out,
    links: [...links.values()].filter((l) => ids.has(l.source) && ids.has(l.target)),
    coverage: base.goals.map((g) => ({ goalId: g.id, covered: coverage.get(g.id)?.covered.size ?? 0, planned: coverage.get(g.id)?.planned.size ?? 0 })),
  };
}
