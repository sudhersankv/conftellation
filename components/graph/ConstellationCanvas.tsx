"use client";
// Force-directed canvas for the constellation. Imported only via next/dynamic (ssr:false) from GraphView,
// so the ref to react-force-graph-2d works (dynamic() itself does not forward refs).
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, type Ref } from "react";
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from "react-force-graph-2d";
import { forceCollide, forceRadial } from "d3-force";
import type { SkyLink, SkyNode } from "@/lib/types";
import { TYPE_COLOR } from "@/lib/ui/tokens";

export interface CanvasHandle { zoomToFit(ms?: number): void }

type GNode = NodeObject<SkyNode & { r: number }>;
type GLink = LinkObject<GNode, { type: SkyLink["type"]; key: string }>;

const BG = "#0B0B12";
const LINK = "rgba(142,142,163,0.25)";
const ACCENT = "#8B7CF6";
const LABEL = "#8E8EA3";

const FIT_TYPES = new Set(["session", "person", "booth", "company"]);

export function nodeRadius(n: SkyNode): number {
  if (n.state === "dust") return 2;
  switch (n.type) {
    case "goal": case "problem": return 9;
    case "conference": return 10;
    case "user": return n.isOtherUser || n.state !== "anchor" ? 4 : 7;
    case "moment": return 3;
    case "topic": return 4;
    default: {
      const base = 6;
      return FIT_TYPES.has(n.type) ? base * (0.8 + 0.4 * (n.fit ?? 0.5)) : base;
    }
  }
}

function alphaHex(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const ALWAYS_LABEL = new Set(["goal", "problem", "conference"]);

interface Props {
  nodes: SkyNode[];
  links: SkyLink[];
  width: number;
  height: number;
  highlight: Set<string>;
  /** During replay: ids revealed so far (null = everything visible). */
  revealed: Set<string> | null;
  anchorId: string;
  onNodeClick(n: SkyNode): void;
  handleRef?: Ref<CanvasHandle>;
}

export function ConstellationCanvas({ nodes, links, width, height, highlight, revealed, anchorId, onNodeClick, handleRef }: Props) {
  const fg = useRef<ForceGraphMethods<GNode, GLink> | undefined>(undefined);
  useImperativeHandle(handleRef, () => ({ zoomToFit: (ms = 400) => fg.current?.zoomToFit(ms, 40) }), []);

  // Copy: the force engine mutates node/link objects. Skipped nodes are not rendered.
  const data = useMemo(() => {
    const ns: GNode[] = nodes.filter((n) => n.state !== "skipped").map((n) => ({ ...n, r: nodeRadius(n) }));
    const ids = new Set(ns.map((n) => n.id));
    const ls: GLink[] = links
      .filter((l) => ids.has(l.source) && ids.has(l.target))
      .map((l, i) => ({ source: l.source, target: l.target, type: l.type, key: `${l.source}>${l.target}#${i}` }));
    return { nodes: ns, links: ls };
  }, [nodes, links]);

  const hasHl = highlight.size > 0;
  const hlRef = useRef(highlight); hlRef.current = highlight;
  const revRef = useRef(revealed); revRef.current = revealed;

  useEffect(() => {
    const g = fg.current;
    if (!g) return;
    (g.d3Force("charge") as unknown as { strength(v: number): void } | undefined)?.strength(-60);
    (g.d3Force("link") as unknown as { distance(v: number): void } | undefined)?.distance(40);
    g.d3Force("radial", forceRadial<GNode>(
      (n) => (n.id === anchorId ? 0 : n.type === "goal" || n.type === "problem" ? 70 : n.state === "dust" ? 320 : n.type === "conference" ? 110 : 180),
      0, 0,
    ).strength((n) => (n.id === anchorId ? 0.9 : n.type === "goal" || n.type === "problem" ? 0.5 : n.state === "dust" ? 0.08 : 0.04)) as never);
    g.d3Force("collide", forceCollide<GNode>((n) => n.r + (n.state === "dust" ? 1 : 8)) as never);
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
    const isHl = hl.has(n.id);
    let alpha = n.state === "dust" ? 0.2 : 1;
    if (hl.size > 0 && !isHl) alpha *= 0.15;
    const isAnchorUser = n.id === anchorId;
    const color = isAnchorUser ? ACCENT : TYPE_COLOR[n.type];
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    const ringOnly = n.type === "conference" || n.state === "planned";
    if (ringOnly) {
      ctx.lineWidth = n.type === "conference" ? 2 / Math.max(scale, 0.6) : 1.5 / Math.max(scale, 0.6);
      ctx.strokeStyle = alphaHex(color, alpha);
      ctx.fillStyle = alphaHex(BG, 1);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = alphaHex(color, alpha);
      ctx.fill();
      if (n.state === "unplanned") {
        ctx.lineWidth = 1 / scale;
        ctx.strokeStyle = `rgba(255,255,255,${0.9 * alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, r + 1.5 / scale, 0, 2 * Math.PI);
        ctx.stroke();
      }
    }
    if (isHl) {
      ctx.lineWidth = 1.5 / scale;
      ctx.strokeStyle = alphaHex(ACCENT, 0.9);
      ctx.beginPath();
      ctx.arc(x, y, r + 3 / scale, 0, 2 * Math.PI);
      ctx.stroke();
    }
    const showLabel = n.state !== "dust" && (ALWAYS_LABEL.has(n.type) || isAnchorUser || isHl || scale >= 1.1);
    if (showLabel) {
      const fs = 11 / scale;
      ctx.font = `${fs}px Geist, ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const text = n.label.length > 34 ? `${n.label.slice(0, 32)}…` : n.label;
      ctx.fillStyle = isHl ? "rgba(237,237,242,0.95)" : alphaHex(n.type === "goal" || n.type === "problem" ? "#C9C9D6" : LABEL, alpha);
      ctx.fillText(text, x, y + r + 3 / scale);
    }
  }, [anchorId]);

  const pointer = useCallback((n: GNode, color: string, ctx: CanvasRenderingContext2D) => {
    const rv = revRef.current;
    if (rv && !rv.has(n.id)) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(n.x ?? 0, n.y ?? 0, Math.max(n.r, 5) + 2, 0, 2 * Math.PI);
    ctx.fill();
  }, []);

  const didFit = useRef(false);
  useEffect(() => { didFit.current = false; }, [data]);

  return (
    <ForceGraph2D<GNode, GLink>
      ref={fg}
      graphData={data}
      width={width}
      height={height}
      backgroundColor={BG}
      nodeId="id"
      nodeLabel={(n) => n.label}
      nodeCanvasObject={paint}
      nodeCanvasObjectMode={() => "replace"}
      nodePointerAreaPaint={pointer}
      linkColor={(l) => (linkLit(l) ? "rgba(139,124,246,0.9)" : hasHl ? "rgba(142,142,163,0.06)" : LINK)}
      linkWidth={(l) => (linkLit(l) ? 1.6 : 1)}
      linkVisibility={linkShown}
      enableNodeDrag
      autoPauseRedraw={false}
      cooldownTicks={data.nodes.length > 400 ? 120 : 200}
      warmupTicks={data.nodes.length > 400 ? 20 : 0}
      onNodeClick={(n) => onNodeClick(n as SkyNode)}
      onEngineStop={() => {
        if (!didFit.current) { didFit.current = true; fg.current?.zoomToFit(400, 40); }
      }}
    />
  );
}
