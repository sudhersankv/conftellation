import type { ConstellationResponse, PlanItem, PlanResponse, SkyNode } from "@/lib/types";
import { STAR } from "@/lib/ui/tokens";
import { radius, seedLayout, type Pos } from "./layout";
import { period, phase } from "./seed";
import type { GNode, LinkDef } from "./types";

export const truncate = (s: string, n = 28) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function planItemById(plan?: PlanResponse) {
  const m = new Map<string, PlanItem>();
  if (!plan) return m;
  const add = (i: PlanItem) => { if (!m.has(i.id)) m.set(i.id, i); };
  plan.itinerary.forEach((s) => add(s.item));
  plan.byGoal.forEach((g) => [...g.sessions, ...g.people, ...g.booths].forEach(add));
  return m;
}

/** Plan score normalised by the best score. */
export function planFits(plan?: PlanResponse) {
  const m = new Map<string, number>();
  if (!plan) return m;
  const items = [...planItemById(plan).values()];
  const max = Math.max(0, ...items.map((i) => i.score));
  if (max > 0) items.forEach((i) => m.set(i.id, i.score / max));
  return m;
}

export function toGNode(n: SkyNode, o: { id?: string; conf: string; fit?: number; pos: Pos; sun?: Pos; fixed?: boolean }): GNode {
  const id = o.id ?? n.id;
  return {
    ...n, id, x: o.pos.x, y: o.pos.y,
    ...(o.fixed ? { fx: o.pos.x, fy: o.pos.y } : {}),
    _orig: n.id, _conf: o.conf,
    _r: n.state === "dust" ? 1 : radius(n.type, o.fit),
    _color: STAR[n.type], _phase: phase(id), _period: period(id), _sun: o.sun, _label: truncate(n.label),
  };
}

export function coverageMap(cov: ConstellationResponse["coverage"]) {
  return new Map(cov.map((c) => [c.goalId, c.planned === 0 ? -1 : c.covered / c.planned]));
}

export function buildConference(resp: ConstellationResponse, o: { confId: string; fits: Map<string, number>; cached?: Map<string, Pos> }) {
  const raw = resp.nodes.filter((n) => n.type !== "conference");
  let dust = 0;
  const src = raw.filter((n) => n.state !== "dust" || ++dust <= 300);
  const placed = seedLayout(src, o.confId, o.cached);
  const nodes = src.map((n) => {
    const p = placed.get(n.id)!;
    return toGNode(n, { conf: n.conferenceId ?? o.confId, fit: n.fit ?? o.fits.get(n.id) ?? 0.5, pos: p, sun: p.sun, fixed: p.fixed });
  });
  const ids = new Set(nodes.map((n) => n.id));
  const defs: LinkDef[] = resp.links.filter((l) => ids.has(l.source) && ids.has(l.target)).map((l) => ({ source: l.source, target: l.target, type: l.type }));
  return { nodes, defs, coverage: coverageMap(resp.coverage) };
}

/**
 * Keep previous node objects (positions survive reloads). Nodes that disappear or turn skipped
 * stay in the array with `_exitAt` until the caller prunes them.
 */
export function reconcile(prev: Map<string, GNode>, next: GNode[], t: number, reduced: boolean) {
  let changed = false;
  const out: GNode[] = [];
  const seen = new Set<string>();
  for (const n of next) {
    const p = prev.get(n.id);
    if (n.state === "skipped") {
      if (p && p.state !== "skipped" && !reduced) { p.state = "skipped"; p._exitAt = t; out.push(p); seen.add(n.id); changed = true; }
      else if (p) changed = true;
      continue;
    }
    seen.add(n.id);
    if (!p) {
      if (prev.size > 0 && !reduced) n._enterAt = t;
      out.push(n); changed = true; continue;
    }
    if (p.state !== n.state || p._exitAt) changed = true;
    const { x, y, vx, vy, fx, fy, _enterAt, _exitAt, ...rest } = n; // eslint-disable-line @typescript-eslint/no-unused-vars
    Object.assign(p, rest);
    p._exitAt = undefined;
    out.push(p);
  }
  for (const [id, p] of prev) {
    if (seen.has(id)) continue;
    if (reduced) { changed = true; continue; }
    if (p._exitAt === undefined) p._exitAt = t;
    out.push(p); changed = true;
  }
  return { nodes: out, changed };
}
