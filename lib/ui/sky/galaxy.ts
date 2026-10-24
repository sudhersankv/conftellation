import type { ConstellationResponse, RecordConference, RecordResponse, SkyNode } from "@/lib/types";
import { toGNode } from "./build";
import { isAnchor, isSun, seedLayout, type Pos } from "./layout";
import { clamp, hash, rng } from "./seed";
import { dayKey } from "./time";
import type { GNode, LinkDef, Slot } from "./types";

/** One fixed slot per conference: today's at the centre, past ones drift out and dim, upcoming ones rise from below. */
export function slotsFor(record: RecordResponse, now: Date) {
  const today = dayKey(now);
  const confs = [...record.conferences].sort((a, b) => a.conference.startDate.localeCompare(b.conference.startDate));
  const day = (c: RecordConference, k: "startDate" | "endDate") => c.conference[k].slice(0, 10);
  const inRange = confs.find((c) => day(c, "startDate") <= today && today <= day(c, "endDate"));
  const centre = inRange ?? confs.find((c) => day(c, "startDate") > today) ?? confs[confs.length - 1];
  const out = new Map<string, Slot>();
  if (!centre) return { slots: out, todayId: null as string | null };
  out.set(centre.conference.id, { x: 0, y: 0, s: 1, alpha: 1, kind: inRange ? "now" : day(centre, "endDate") < today ? "past" : "next" });
  const past = confs.filter((c) => c !== centre && day(c, "endDate") < today).reverse();
  past.forEach((c, k) => {
    const th = -Math.PI / 2 + (rng(hash(c.conference.id))() - 0.5) * ((2 * Math.PI) / 3), d = 300 + 160 * k;
    out.set(c.conference.id, { x: d * Math.cos(th), y: d * Math.sin(th), s: 0.45 * 0.8 ** k, alpha: Math.max(0.35, 0.8 * 0.85 ** k), kind: "past" });
  });
  confs.filter((c) => c !== centre && day(c, "endDate") >= today).forEach((c, j) => {
    out.set(c.conference.id, { x: (j % 2 ? 1 : -1) * (120 + 60 * j), y: 320 + 150 * j, s: 0.5, alpha: 0.8, kind: "next" });
  });
  return { slots: out, todayId: inRange ? centre.conference.id : null };
}

/** 5–8 highest-fit stars outline the constellation. */
export function pickShape<T extends SkyNode>(nodes: T[]) {
  const fit = (n: T) => n.fit ?? 0.5;
  const pool = nodes.filter((n) => !isSun(n) && n.type !== "moment" && n.type !== "topic" && n.type !== "conference" && n.state !== "dust" && !isAnchor(n) && !n.isOtherUser);
  pool.sort((a, b) => fit(b) - fit(a) || a.id.localeCompare(b.id));
  const picked = pool.slice(0, clamp(pool.length, 5, 8));
  if (picked.length < 5) picked.push(...nodes.filter(isSun).slice(0, 5 - picked.length));
  return picked;
}

/** Prim's minimum spanning tree over points; returns index pairs. */
export function mst(points: Pos[]) {
  const n = points.length, inTree = new Array<boolean>(n).fill(false), best = new Array<number>(n).fill(Infinity), from = new Array<number>(n).fill(-1);
  const out: [number, number][] = [];
  if (!n) return out;
  best[0] = 0;
  for (let i = 0; i < n; i++) {
    let u = -1;
    for (let j = 0; j < n; j++) if (!inTree[j] && (u < 0 || best[j] < best[u])) u = j;
    inTree[u] = true;
    if (from[u] >= 0) out.push([from[u], u]);
    for (let v = 0; v < n; v++) {
      if (inTree[v]) continue;
      const d = (points[u].x - points[v].x) ** 2 + (points[u].y - points[v].y) ** 2;
      if (d < best[v]) { best[v] = d; from[v] = u; }
    }
  }
  return out;
}

export const ns = (conf: string, id: string) => `${conf}::${id}`;

export function buildGalaxy(
  record: RecordResponse,
  byConf: Record<string, ConstellationResponse | null>,
  slots: Map<string, Slot>,
  cachedPos: Map<string, Map<string, Pos>>,
) {
  const nodes: GNode[] = [];
  const defs: LinkDef[] = [];
  for (const rc of record.conferences) {
    const conf = rc.conference.id, slot = slots.get(conf);
    if (!slot) continue;
    const resp = byConf[conf];
    const confNode: SkyNode = { id: conf, type: "conference", label: rc.conference.name, state: "anchor", conferenceId: conf };
    const c = toGNode(confNode, { id: ns(conf, "__conf"), conf, pos: { x: slot.x, y: slot.y }, fixed: true });
    c._hitR = 165 * slot.s; c._slotAlpha = slot.alpha;
    nodes.push(c);
    if (!resp) continue;
    const keep = resp.nodes.filter((n) => n.type !== "conference" && !isAnchor(n) && !n.isOtherUser && n.state !== "skipped");
    let dust = 0;
    const src = keep.filter((n) => n.state !== "dust" || ++dust <= 40);
    const placed = seedLayout(src, conf, cachedPos.get(conf));
    const shape = new Set(pickShape(src).map((n) => n.id));
    const shaped: GNode[] = [];
    for (const n of src) {
      const p = placed.get(n.id)!;
      const g = toGNode(n, { id: ns(conf, n.id), conf, fit: n.fit ?? 0.5, pos: { x: slot.x + slot.s * p.x, y: slot.y + slot.s * p.y }, fixed: true });
      g._slotAlpha = slot.alpha; g._shape = shape.has(n.id);
      nodes.push(g);
      if (g._shape) shaped.push(g);
    }
    mst(shaped.map((g) => ({ x: g.x!, y: g.y! }))).forEach(([a, b]) => defs.push({ source: shaped[a].id, target: shaped[b].id, type: "SHAPE" }));
  }
  return { nodes, defs };
}
