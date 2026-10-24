import { forceCollide, forceX, forceY } from "d3-force";
import type { SkyNode, SkyNodeType } from "@/lib/types";
import { clamp, hash, rng } from "./seed";
import type { FG, GNode } from "./types";

export const BASE_R: Record<SkyNodeType, number> = {
  goal: 9, problem: 9, conference: 14, session: 4.5, person: 4.5, booth: 4.5, company: 4.5, user: 3, moment: 2, meet: 4, topic: 2.5,
};
export const radius = (type: SkyNodeType, fit = 0.5) => BASE_R[type] * (0.7 + 0.6 * clamp(fit));
export const isSun = (n: { type: SkyNodeType }) => n.type === "goal" || n.type === "problem";
export const isAnchor = (n: SkyNode) => n.type === "user" && !n.isOtherUser;

export type Pos = { x: number; y: number };
export interface Placed extends Pos { fixed: boolean; sun?: Pos }

/** Suns sit on a circle of radius 120, in input order. */
export function sunPositions(nodes: SkyNode[]) {
  const suns = nodes.filter(isSun);
  const out = new Map<string, Pos>();
  suns.forEach((n, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / suns.length;
    out.set(n.id, { x: 120 * Math.cos(a), y: 120 * Math.sin(a) });
  });
  return out;
}

/** Deterministic positions in conference-local coords; cached positions win. */
export function seedLayout(nodes: SkyNode[], confId: string, cached?: Map<string, Pos>) {
  const suns = sunPositions(nodes);
  const out = new Map<string, Placed>();
  for (const n of nodes) {
    const sunId = isSun(n) ? n.id : n.goalId;
    const sun = sunId ? suns.get(sunId) : undefined;
    const c = cached?.get(n.id);
    if (isSun(n)) { const p = suns.get(n.id)!; out.set(n.id, { ...p, fixed: true, sun: p }); continue; }
    if (isAnchor(n)) { out.set(n.id, { x: 0, y: 0, fixed: true }); continue; }
    if (c) { out.set(n.id, { ...c, fixed: false, sun }); continue; }
    const r = rng(hash(confId + n.id));
    const rad = 18 + 40 * r(), th = 2 * Math.PI * r();
    const o = sun ?? { x: 0, y: 0 };
    out.set(n.id, { x: o.x + rad * Math.cos(th), y: o.y + rad * Math.sin(th), fixed: false, sun });
  }
  return out;
}

type ForceArg = Parameters<FG["d3Force"]>[1];
export function applyForces(fg: FG, mode: "galaxy" | "conference") {
  const gal = mode === "galaxy";
  (fg.d3Force("charge") as { strength?: (v: number) => void } | undefined)?.strength?.(gal ? 0 : -60);
  const link = fg.d3Force("link") as { distance?: (v: number) => unknown; strength?: (v: number) => unknown } | undefined;
  link?.distance?.(26); link?.strength?.(gal ? 0 : 0.25);
  fg.d3Force("x", forceX<GNode>((n) => n._sun?.x ?? 0).strength((n) => (n._sun ? 0.12 : 0.03)) as unknown as ForceArg);
  fg.d3Force("y", forceY<GNode>((n) => n._sun?.y ?? 0).strength((n) => (n._sun ? 0.12 : 0.03)) as unknown as ForceArg);
  fg.d3Force("collide", forceCollide<GNode>((n) => (n.state === "dust" ? 1.5 : n._r + 2)) as unknown as ForceArg);
}
