"use client";
// Force-directed canvas for the constellation. Imported only via next/dynamic (ssr:false) from GraphView,
// so the ref to react-force-graph-2d works (dynamic() itself does not forward refs).
// Neo-brutalist look: flat discs with ink outlines on cream paper, readable label chips drawn above everything.
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, type Ref } from "react";
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from "react-force-graph-2d";
import { forceCollide, forceRadial } from "d3-force";
import type { SkyLink, SkyNode } from "@/lib/types";
import { INK, NODE_COLOR, PAPER, YELLOW, rgba, titleCase, truncate } from "./palette";

export interface CanvasHandle { zoomToFit(ms?: number): void }

type GNode = NodeObject<SkyNode & { r: number; text: string; full: string; labelW: number }>;
type GLink = LinkObject<GNode, { type: SkyLink["type"]; key: string }>;

const FIT_TYPES = new Set(["session", "person", "booth", "company"]);
const ALWAYS_LABEL = new Set(["goal", "problem", "conference"]);
const FONT = `"DM Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;

export function nodeRadius(n: SkyNode, anchorId?: string): number {
  if (n.id === anchorId) return 14;
  if (n.state === "dust") return 4;
  switch (n.type) {
    case "goal": case "problem": return 11;
    case "conference": return 11;
    case "user": return n.isOtherUser || n.state !== "anchor" ? 6 : 12;
    case "moment": return 4;
    case "topic": return 6;
    default: {
      const base = 8;
      return FIT_TYPES.has(n.type) ? base * (0.8 + 0.4 * (n.fit ?? 0.5)) : base;
    }
  }
}

function ringRadius(n: GNode, anchorId: string) {
  if (n.id === anchorId) return 0;
  if (n.state === "dust") return 400;
  switch (n.type) {
    case "goal": case "problem": return 120;
    case "topic": return 200;
    case "conference": return 200;
    case "moment": return 300;
    case "user": return 330;
    default: return 260;
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

let measureCtx: CanvasRenderingContext2D | null = null;
function measure(text: string, weight: number) {
  if (typeof document === "undefined") return text.length * 7;
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * 7;
  measureCtx.font = `${weight} 12px ${FONT}`;
  return measureCtx.measureText(text).width;
}

interface Props {
  nodes: SkyNode[];
  links: SkyLink[];
  width: number;
  height: number;
  highlight: Set<string>;
  /** During replay: ids revealed so far (null = everything visible). */
  revealed: Set<string> | null;
  anchorId: string;
  /** Tapped node; it and its neighbours get labels (phone shows only goal labels until something is tapped). */
  selectedId?: string | null;
  onNodeClick(n: SkyNode): void;
  handleRef?: Ref<CanvasHandle>;
}

export function ConstellationCanvas({ nodes, links, width, height, highlight, revealed, anchorId, selectedId, onNodeClick, handleRef }: Props) {
  const fg = useRef<ForceGraphMethods<GNode, GLink> | undefined>(undefined);
  const phone = width < 640;
  const pad = phone ? 20 : 40;
  useImperativeHandle(handleRef, () => ({ zoomToFit: (ms = 400) => fg.current?.zoomToFit(ms, pad) }), [pad]);

  // Copy: the force engine mutates node/link objects. Skipped nodes are not rendered.
  const data = useMemo(() => {
    const ns: GNode[] = nodes.filter((n) => n.state !== "skipped").map((n) => {
      const full = titleCase(n.label);
      const text = truncate(full, 28);
      const weight = n.id === anchorId || n.type === "goal" || n.type === "problem" ? 600 : 500;
      return { ...n, r: nodeRadius(n, anchorId), full, text, labelW: measure(text, weight) + 12 };
    });
    const ids = new Set(ns.map((n) => n.id));
    const ls: GLink[] = links
      .filter((l) => ids.has(l.source) && ids.has(l.target))
      .map((l, i) => ({ source: l.source, target: l.target, type: l.type, key: `${l.source}>${l.target}#${i}` }));
    return { nodes: ns, links: ls };
  }, [nodes, links, anchorId]);

  const neighbours = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of links) {
      if (!m.has(l.source)) m.set(l.source, new Set());
      if (!m.has(l.target)) m.set(l.target, new Set());
      m.get(l.source)!.add(l.target);
      m.get(l.target)!.add(l.source);
    }
    return m;
  }, [links]);

  const hasHl = highlight.size > 0;
  const hlRef = useRef(highlight); hlRef.current = highlight;
  const revRef = useRef(revealed); revRef.current = revealed;
  const selIdRef = useRef(selectedId); selIdRef.current = selectedId;
  const selRef = useRef<Set<string>>(new Set());
  selRef.current = useMemo(() => (selectedId ? new Set([selectedId, ...(neighbours.get(selectedId) ?? [])]) : new Set<string>()), [selectedId, neighbours]);

  useEffect(() => {
    const g = fg.current;
    if (!g) return;
    (g.d3Force("charge") as unknown as { strength(v: number): void } | undefined)?.strength(-120);
    (g.d3Force("link") as unknown as { distance(v: number): void; strength(v: number): void } | undefined)?.distance(60);
    (g.d3Force("link") as unknown as { strength(v: number): void } | undefined)?.strength(0.04);
    g.d3Force("radial", forceRadial<GNode>((n) => ringRadius(n, anchorId), 0, 0)
      .strength((n) => (n.id === anchorId ? 1 : n.type === "goal" || n.type === "problem" ? 0.9 : n.state === "dust" ? 0.3 : 0.6)) as never);
    // Collide on the label chip half-width (capped) so always-on labels don't stack.
    g.d3Force("collide", forceCollide<GNode>((n) => {
      if (n.state === "dust") return n.r + 4;
      if (ALWAYS_LABEL.has(n.type) || n.id === anchorId) return Math.max(n.r + 14, Math.min(n.labelW / 2, 70));
      return n.r + 22;
    }).iterations(3) as never);
    g.d3ReheatSimulation();
  }, [data, anchorId]);

  const endLinkId = (v: unknown) => (typeof v === "object" && v ? (v as GNode).id : String(v));
  const linkLit = useCallback((l: GLink) => {
    const s = endLinkId(l.source), t = endLinkId(l.target);
    return hlRef.current.has(s) && hlRef.current.has(t);
  }, []);
  const linkShown = useCallback((l: GLink) => {
    const rv = revRef.current;
    if (!rv) return true;
    return rv.has(endLinkId(l.source)) && rv.has(endLinkId(l.target));
  }, []);

  const paint = useCallback((n: GNode, ctx: CanvasRenderingContext2D, scale: number) => {
    const rv = revRef.current;
    const hl = hlRef.current;
    if (rv && !rv.has(n.id)) return;
    const x = n.x ?? 0, y = n.y ?? 0, r = n.r;
    const isHl = hl.has(n.id) || n.id === selIdRef.current;
    const dust = n.state === "dust";
    let alpha = dust ? 0.35 : 1;
    if (hl.size > 0 && !hl.has(n.id)) alpha *= 0.15;
    const isAnchor = n.id === anchorId;
    const color = NODE_COLOR[n.type];
    const px = 1 / Math.max(scale, 0.7); // ~1 screen px, never vanishing when zoomed far out
    const ink = rgba(INK, alpha);

    // Hard offset shadow under goals and the anchor.
    if (!dust && (n.type === "goal" || n.type === "problem" || isAnchor)) {
      ctx.beginPath();
      ctx.arc(x + 2.5 * px, y + 2.5 * px, r, 0, 2 * Math.PI);
      ctx.fillStyle = ink;
      ctx.fill();
    }

    let fill = color, stroke = INK, lw = 2;
    if (isAnchor) { fill = INK; stroke = YELLOW; lw = 3; }
    else if (dust) { lw = 1; }
    else if (n.type === "conference") { fill = PAPER; stroke = color; lw = 3; }
    else if (n.type === "topic") { fill = PAPER; }
    else if (n.state === "planned") { fill = PAPER; stroke = n.type === "moment" ? INK : color; }
    else if (n.state === "unplanned") { lw = 3; }

    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fillStyle = rgba(fill, alpha);
    ctx.fill();
    ctx.lineWidth = lw * px;
    ctx.strokeStyle = rgba(stroke, alpha);
    ctx.stroke();
    // Planned nodes get a thin ink hairline outside the colour ring so they stay crisp on cream.
    if (!isAnchor && !dust && n.state === "planned" && n.type !== "topic" && n.type !== "conference") {
      ctx.beginPath();
      ctx.arc(x, y, r + lw * px * 0.5 + 0.5 * px, 0, 2 * Math.PI);
      ctx.lineWidth = 1 * px;
      ctx.strokeStyle = rgba(INK, 0.7 * alpha);
      ctx.stroke();
    }
    if (isHl) {
      ctx.beginPath();
      ctx.arc(x, y, r + 5 * px, 0, 2 * Math.PI);
      ctx.lineWidth = 3 * px;
      ctx.strokeStyle = YELLOW;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, r + 6.5 * px, 0, 2 * Math.PI);
      ctx.lineWidth = 1.2 * px;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
  }, [anchorId]);

  // Labels: drawn after all nodes/links so chips never sit under a disc or a line.
  const drawLabels = useCallback((ctx: CanvasRenderingContext2D, scale: number) => {
    const rv = revRef.current;
    const hl = hlRef.current;
    const sel = selRef.current;
    const zoomed = scale >= (phone ? 1.6 : 0.9);
    const fs = 12.5 / scale;
    const padX = 6 / scale, padY = 3 / scale, h = fs + 2 * padY;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Greedy de-overlap: anchor, goals and lit nodes claim space first; a chip that would cover one already drawn is skipped.
    const rank = (n: GNode) => (n.id === anchorId ? 0 : hl.has(n.id) || sel.has(n.id) ? 1 : n.type === "goal" || n.type === "problem" ? 2 : n.type === "conference" ? 3 : 4 + (1 - (n.fit ?? 0.5)));
    const order = [...data.nodes].sort((a, b) => rank(a) - rank(b));
    const placed: [number, number, number, number][] = [];
    for (const n of order) {
      if (n.state === "dust") continue;
      if (rv && !rv.has(n.id)) continue;
      const isAnchor = n.id === anchorId;
      const isGoal = n.type === "goal" || n.type === "problem";
      const lit = hl.has(n.id) || sel.has(n.id);
      const always = phone ? isGoal || isAnchor : ALWAYS_LABEL.has(n.type) || isAnchor;
      if (!(always || lit || zoomed)) continue;
      let alpha = 1;
      if (hl.size > 0 && !hl.has(n.id)) alpha = 0.2;
      const weight = isAnchor || isGoal ? 600 : 500;
      ctx.font = `${weight} ${fs}px ${FONT}`;
      const w = ctx.measureText(n.text).width + 2 * padX;
      const x = n.x ?? 0, y = (n.y ?? 0) + n.r + 4 / scale + h / 2;
      const box: [number, number, number, number] = [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
      const m = 2 / scale;
      if (!always && placed.some((b) => box[0] < b[2] + m && box[2] > b[0] - m && box[1] < b[3] + m && box[3] > b[1] - m)) continue;
      placed.push(box);
      roundRect(ctx, x - w / 2, y - h / 2, w, h, 5 / scale);
      ctx.fillStyle = isGoal || isAnchor ? rgba(lit ? YELLOW : PAPER, alpha) : rgba(lit ? YELLOW : PAPER, alpha * 0.96);
      ctx.fill();
      ctx.lineWidth = (isGoal || isAnchor ? 1.5 : 1) / scale;
      ctx.strokeStyle = rgba(INK, (isGoal || isAnchor ? 0.9 : 0.6) * alpha);
      ctx.stroke();
      ctx.fillStyle = rgba(INK, alpha);
      ctx.fillText(n.text, x, y + 0.5 / scale);
    }
  }, [data, anchorId, phone]);

  const pointer = useCallback((n: GNode, color: string, ctx: CanvasRenderingContext2D) => {
    const rv = revRef.current;
    if (rv && !rv.has(n.id)) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(n.x ?? 0, n.y ?? 0, Math.max(n.r, 6) + 3, 0, 2 * Math.PI);
    ctx.fill();
  }, []);

  const didFit = useRef(false);
  useEffect(() => {
    didFit.current = false;
    const t = setTimeout(() => fg.current?.zoomToFit(400, pad), 1500);
    return () => clearTimeout(t);
  }, [data, pad]);

  return (
    <ForceGraph2D<GNode, GLink>
      ref={fg}
      graphData={data}
      width={width}
      height={height}
      backgroundColor="rgba(0,0,0,0)"
      nodeId="id"
      nodeLabel={(n) => `<div style="font:500 12px ${FONT.replace(/"/g, "'")};color:#111;background:#fff;border:2px solid #111;border-radius:6px;padding:4px 8px;box-shadow:2px 2px 0 #111">${escapeHtml(n.full)}</div>`}
      nodeCanvasObject={paint}
      nodeCanvasObjectMode={() => "replace"}
      nodePointerAreaPaint={pointer}
      onRenderFramePost={drawLabels}
      linkColor={(l) => (linkLit(l) ? rgba(INK, 0.9) : hasHl ? rgba(INK, 0.05) : rgba(INK, 0.18))}
      linkWidth={(l) => (linkLit(l) ? 2 : 1.5)}
      linkVisibility={linkShown}
      enableNodeDrag
      autoPauseRedraw={false}
      cooldownTicks={data.nodes.length > 400 ? 120 : 220}
      warmupTicks={data.nodes.length > 400 ? 20 : 30}
      onNodeClick={(n) => onNodeClick(n as SkyNode)}
      onEngineStop={() => {
        if (!didFit.current) { didFit.current = true; fg.current?.zoomToFit(400, pad); }
      }}
    />
  );
}

