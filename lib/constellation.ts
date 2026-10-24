// Q11: flatten the user's graph into the Sky. Every node a plan/brief why-path mentions is included (same ids),
// so the UI can trace any WhyPath; capture `lit` ids (moment, target, person, goal) are always present.
import { runPlanner } from "@/lib/agents/planner";
import { skyBase, skyDust, skyMet, skyMoments, skyOthers, skySkipped, skySummaryPaths } from "@/lib/queries/constellation";
import type { ConstellationResponse, EdgeType, NodeLabel, PlanItem, SkyLink, SkyNode, SkyNodeType, WhyPath } from "@/lib/types";

export const MAX_NODES = 800;
export const MAX_DUST_PER_CONF = 300;
const MAX_OTHER_USERS = 12;
const LABEL_MAX = 48;

const TYPE: Partial<Record<NodeLabel, SkyNodeType>> = {
  Conference: "conference", Session: "session", Person: "person", Company: "company", Booth: "booth", Topic: "topic",
  User: "user", Goal: "goal", Problem: "problem", Moment: "moment", Meet: "meet",
};
const short = (s: string, n = LABEL_MAX) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const round2 = (x: number) => Math.round(x * 100) / 100;

export const emptyConstellation = (): ConstellationResponse => ({ nodes: [], links: [], coverage: [] });

export async function buildConstellation(userId: string, confId: string | null, opts: { now?: string } = {}): Promise<ConstellationResponse> {
  const base = await skyBase(userId, confId);
  if (!base) return emptyConstellation();
  const confIds = base.conferences.map((c) => c.id);
  if (!confIds.length) return emptyConstellation();

  const [plans, moments, met, skipped, summaries] = await Promise.all([
    Promise.all(confIds.map((c) => runPlanner(userId, c, { write: false, now: opts.now }).then((r) => r.plan))),
    skyMoments(userId, confIds),
    skyMet(userId, confIds),
    skySkipped(userId, confIds),
    skySummaryPaths(userId, confIds),
  ]);

  const nodes = new Map<string, SkyNode>();
  const links = new Map<string, SkyLink>();
  const add = (n: SkyNode) => {
    const prev = nodes.get(n.id);
    if (!prev) nodes.set(n.id, n);
    else for (const [k, v] of Object.entries(n)) if ((prev as unknown as Record<string, unknown>)[k] === undefined) (prev as unknown as Record<string, unknown>)[k] = v;
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
  const goalConf = (g: (typeof base.goals)[number]) =>
    [g.own, g.planned].find((c) => c && confIds.includes(c)) ?? confFallback;
  for (const g of base.goals) {
    add({ id: g.id, type: "goal", label: g.text, state: "anchor", goalId: g.id, conferenceId: goalConf(g), fit: Math.min(1, Math.max(0, g.weight)) });
    link(userId, g.id, "HAS_GOAL");
  }
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

  // ----- plan items + every node on their why paths -----
  const coverage = new Map<string, { covered: Set<string>; planned: Set<string> }>();
  const pathNodes = (paths: WhyPath[], conferenceId: string, goalId?: string) => {
    for (const w of paths) {
      for (const n of w.nodes) {
        const type = TYPE[n.label];
        if (!type || nodes.has(n.id)) continue;
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
        goalId: item.goalId, conferenceId, fit: top > 0 ? round2(item.score / top) : undefined, at: item.status === "done" ? undefined : at,
      });
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
  for (const m of [...moments].reverse()) {
    const goalId = goalOfTarget(m.targetId) ?? goalOfTarget(m.personId) ?? goalForTopics(m.topics);
    add({ id: m.id, type: "moment", label: short(m.text ?? m.kind, 40), state: "done", at: m.at, goalId, conferenceId: m.conferenceId });
    if (m.targetId && m.targetLabel && TYPE[m.targetLabel]) {
      const t = nodes.get(m.targetId);
      if (!t || t.state === "dust") nodes.delete(m.targetId);
      add({ id: m.targetId, type: TYPE[m.targetLabel]!, label: short(m.targetTitle ?? m.targetId), state: "unplanned", goalId, conferenceId: m.conferenceId });
      const target = nodes.get(m.targetId)!;
      if (m.kind === "checkin" && target.state !== "planned") target.at ??= m.at;
      link(m.id, m.targetId, "AT");
    }
    if (m.personId) {
      if (nodes.get(m.personId)?.state === "dust") nodes.delete(m.personId);
      add({ id: m.personId, type: "person", label: short(m.personName ?? m.personId), state: "unplanned", goalId, conferenceId: m.conferenceId, at: m.at });
      link(m.id, m.personId, "MET");
    }
    if (!m.targetId && !m.personId) link(userId, m.id, "CAPTURED");
  }
  for (const p of met) {
    if (nodes.get(p.id)?.state === "dust") nodes.delete(p.id);
    add({ id: p.id, type: "person", label: short(p.name ?? p.id), state: "unplanned", conferenceId: p.conferenceId, at: p.at ?? undefined });
    link(userId, p.id, "MET");
  }

  // ----- brief / trip report paths -----
  for (const s of summaries) pathNodes(s.paths, s.conferenceId);

  // ----- skipped (hidden in the Sky, present so steer can animate them out) -----
  for (const x of skipped) {
    const type = TYPE[x.label];
    if (!type) continue;
    const prev = nodes.get(x.id);
    if (prev) prev.state = "skipped";
    else add({ id: x.id, type, label: short(x.name ?? x.id), state: "skipped", conferenceId: x.conferenceId ?? confFallback });
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
    for (const [tid, type] of e.targets) link(oid, tid, type);
  }

  // ----- dust: the rest of each conference, capped -----
  let budget = MAX_NODES - nodes.size;
  for (const c of confIds) {
    if (budget <= 0) break;
    const cap = Math.min(MAX_DUST_PER_CONF, budget);
    const dust = await skyDust(c, cap + nodes.size);
    const extra = [...dust.sessions.map((s) => ({ ...s, type: "session" as const, edge: "HAS_SESSION" as const })), ...dust.booths.map((b) => ({ ...b, type: "booth" as const, edge: "HAS_BOOTH" as const }))]
      .filter((d) => !nodes.has(d.id)).slice(0, cap);
    for (const d of extra) {
      add({ id: d.id, type: d.type, label: short(d.label ?? d.id, 32), state: "dust", conferenceId: c });
      link(c, d.id, d.edge);
    }
    budget -= extra.length;
  }

  const out = [...nodes.values()].slice(0, MAX_NODES);
  const ids = new Set(out.map((n) => n.id));
  return {
    nodes: out,
    links: [...links.values()].filter((l) => ids.has(l.source) && ids.has(l.target)),
    coverage: base.goals.map((g) => ({ goalId: g.id, covered: coverage.get(g.id)?.covered.size ?? 0, planned: coverage.get(g.id)?.planned.size ?? 0 })),
  };
}
