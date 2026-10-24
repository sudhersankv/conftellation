"use client";
// Trace mode: "my conftellation" as a path through the day. x = time, y = lane; no force simulation.
// The thick ink polyline is what you actually did (nodes with `at`), in time order; planned items sit on the
// timeline as outlined discs with a dashed line to their goal. SVG in a horizontally scrollable box.
import { useEffect, useMemo, useRef } from "react";
import type { ItinerarySlot, SkyLink, SkyNode, SkyNodeType } from "@/lib/types";
import { INK, NODE_COLOR, PAPER, YELLOW, titleCase, truncate } from "./palette";

type Lane = "session" | "booth" | "person" | "moment";
const LANES: { key: Lane; label: string }[] = [
  { key: "session", label: "Sessions" }, { key: "booth", label: "Booths" }, { key: "person", label: "People" }, { key: "moment", label: "Notes" },
];
const laneOf = (t: SkyNodeType): Lane | null =>
  t === "session" ? "session" : t === "booth" ? "booth" : t === "person" ? "person" : t === "moment" ? "moment" : null;

const HOUR = 3600_000;
const GUTTER = 84; // lane labels
const TOP = 96; // room for the page header overlay
const FONT = `"DM Sans", ui-sans-serif, system-ui, sans-serif`;

let mctx: CanvasRenderingContext2D | null = null;
function textW(s: string, weight = 500) {
  if (typeof document === "undefined") return s.length * 6.6;
  mctx ??= document.createElement("canvas").getContext("2d");
  if (!mctx) return s.length * 6.6;
  mctx.font = `${weight} 12px ${FONT}`;
  return mctx.measureText(s).width;
}

function hourLabel(t: number) {
  const d = new Date(t);
  const h = d.getHours();
  return `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
}

interface Props {
  nodes: SkyNode[];
  links: SkyLink[];
  itinerary: ItinerarySlot[];
  coverage: { goalId: string; covered: number; planned: number }[];
  width: number;
  height: number;
  highlight: Set<string>;
  revealed: Set<string> | null;
  nowIso?: string;
  onNodeClick(n: SkyNode): void;
}

interface Placed { n: SkyNode; t: number; x: number; y: number; r: number; text: string; full: string; walked: boolean }

export function TraceView({ nodes, links, itinerary, coverage, width, height, highlight, revealed, nowIso, onNodeClick }: Props) {
  const phone = width < 640;
  const scroller = useRef<HTMLDivElement>(null);

  const slotFrom = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of itinerary) {
      const t = Date.parse(s.from);
      if (!Number.isNaN(t) && !m.has(s.item.id)) m.set(s.item.id, t);
    }
    return m;
  }, [itinerary]);

  const layout = useMemo(() => {
    const goals = nodes.filter((n) => (n.type === "goal" || n.type === "problem") && n.state !== "skipped");
    const timed: { n: SkyNode; t: number }[] = [];
    for (const n of nodes) {
      if (n.state === "skipped" || n.state === "dust" || !laneOf(n.type)) continue;
      const t = n.at ? Date.parse(n.at) : slotFrom.get(n.id);
      if (t === undefined || Number.isNaN(t)) continue;
      timed.push({ n, t });
    }
    const now = nowIso ? Date.parse(nowIso) : Date.now();
    const ts = timed.map((x) => x.t);
    let start = ts.length ? Math.min(...ts) - HOUR / 2 : now - 4 * HOUR;
    let end = ts.length ? Math.max(...ts) + HOUR / 2 : now + 4 * HOUR;
    if (end - start < 2 * HOUR) { start -= HOUR; end += HOUR; }
    const hours = (end - start) / HOUR;
    const fitPx = (width - GUTTER - 24) / hours;
    const pxPerHour = Math.max(fitPx, phone ? 110 : 150);
    const W = Math.round(GUTTER + 24 + hours * pxPerHour);
    const xOf = (t: number) => GUTTER + 12 + ((t - start) / HOUR) * pxPerHour;

    const goalY = TOP + 22;
    const axisY = TOP + 92;
    const laneTop = axisY + 18;
    const laneH = Math.max(96, (height - laneTop - 56) / LANES.length);
    const H = Math.max(height, laneTop + laneH * LANES.length + 56);

    const goalPos = new Map<string, { x: number; y: number }>();
    const gap = (Math.max(width, W) - GUTTER) / Math.max(goals.length, 1);
    goals.forEach((g, i) => goalPos.set(g.id, { x: GUTTER + gap * (i + 0.5), y: goalY }));

    const placed: Placed[] = [];
    LANES.forEach((lane, li) => {
      const items = timed.filter((x) => laneOf(x.n.type) === lane.key).sort((a, b) => a.t - b.t);
      const rows = lane.key === "moment" ? 2 : Math.max(1, Math.floor((laneH - 16) / 36));
      const lastEnd = new Array(rows).fill(-Infinity);
      for (const { n, t } of items) {
        const full = titleCase(n.label);
        const text = truncate(full, 28);
        const x = xOf(t);
        const half = lane.key === "moment" ? 6 : (textW(text) + 12) / 2;
        let row = lastEnd.findIndex((e) => x - half > e + 6);
        if (row < 0) row = lastEnd.indexOf(Math.min(...lastEnd));
        lastEnd[row] = x + half;
        const y = laneTop + li * laneH + 18 + row * (lane.key === "moment" ? 14 : 36);
        const walked = !!n.at && n.state !== "planned";
        placed.push({ n, t, x, y, r: lane.key === "moment" ? 4 : 8, text, full, walked });
      }
    });
    const ticks: number[] = [];
    for (let t = Math.ceil(start / HOUR) * HOUR; t <= end; t += HOUR) ticks.push(t);
    return { goals, goalPos, placed, ticks, xOf, start, end, now, W, H, axisY, laneTop, laneH };
  }, [nodes, slotFrom, nowIso, width, height, phone]);

  const { goals, goalPos, placed, ticks, xOf, start, end, now, W, H, axisY, laneTop, laneH } = layout;
  const byId = useMemo(() => new Map(placed.map((p) => [p.n.id, p])), [placed]);

  // Goal for each item: explicit goalId, else a linked goal/problem node.
  const goalOf = useMemo(() => {
    const goalIds = new Set(goals.map((g) => g.id));
    const m = new Map<string, string>();
    for (const p of placed) if (p.n.goalId && goalIds.has(p.n.goalId)) m.set(p.n.id, p.n.goalId);
    for (const l of links) {
      if (goalIds.has(l.source) && byId.has(l.target) && !m.has(l.target)) m.set(l.target, l.source);
      if (goalIds.has(l.target) && byId.has(l.source) && !m.has(l.source)) m.set(l.source, l.target);
    }
    return m;
  }, [goals, placed, links, byId]);

  const trace = useMemo(() => placed.filter((p) => p.walked).sort((a, b) => a.t - b.t), [placed]);

  const shown = (id: string) => !revealed || revealed.has(id);
  const hasHl = highlight.size > 0;
  const alphaFor = (id: string, t?: number) => (hasHl && !highlight.has(id) ? 0.15 : t !== undefined && t > now ? 0.6 : 1);

  // Start scrolled so "now" is in view on a narrow screen.
  useEffect(() => {
    const el = scroller.current;
    if (!el || W <= width) return;
    el.scrollLeft = Math.max(0, xOf(Math.min(Math.max(now, start), end)) - width * 0.6);
  }, [W, width, xOf, now, start, end]);

  const traceShown = trace.filter((p) => shown(p.n.id));
  const nowX = now >= start && now <= end ? xOf(now) : null;
  const covBy = new Map(coverage.map((c) => [c.goalId, c]));

  return (
    <div ref={scroller} className="size-full overflow-x-auto overflow-y-auto overscroll-contain">
      <svg width={Math.max(W, width)} height={H} style={{ fontFamily: FONT }} role="img" aria-label="Your trace through the day">
        {/* lanes */}
        {LANES.map((l, i) => (
          <g key={l.key}>
            {i > 0 && <line x1={0} x2={Math.max(W, width)} y1={laneTop + i * laneH} y2={laneTop + i * laneH} stroke={INK} strokeOpacity={0.12} strokeDasharray="2 4" />}
            <text x={12} y={laneTop + i * laneH + 22} fontSize={11} fontWeight={700} fill={INK} style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>{l.label}</text>
          </g>
        ))}

        {/* time axis */}
        <line x1={GUTTER} x2={Math.max(W, width) - 12} y1={axisY} y2={axisY} stroke={INK} strokeWidth={2} />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={xOf(t)} x2={xOf(t)} y1={axisY - 5} y2={axisY + 5} stroke={INK} strokeWidth={2} />
            <line x1={xOf(t)} x2={xOf(t)} y1={axisY + 5} y2={H - 48} stroke={INK} strokeOpacity={0.06} />
            <text x={xOf(t)} y={axisY - 10} fontSize={11} fontWeight={600} fill={INK} textAnchor="middle">{hourLabel(t)}</text>
          </g>
        ))}

        {/* goal → item lines (under everything) */}
        {placed.map((p) => {
          const g = goalOf.get(p.n.id);
          const gp = g ? goalPos.get(g) : undefined;
          if (!gp || !shown(p.n.id) || p.n.type === "moment") return null;
          const a = alphaFor(p.n.id) === 0.15 && !(highlight.has(p.n.id) && g && highlight.has(g)) ? 0.03 : 1;
          const lit = hasHl && highlight.has(p.n.id) && !!g && highlight.has(g);
          return p.walked
            ? <line key={`g-${p.n.id}`} x1={gp.x} y1={gp.y} x2={p.x} y2={p.y} stroke={INK} strokeOpacity={lit ? 0.9 : 0.18 * a} strokeWidth={lit ? 2 : 1} />
            : <line key={`g-${p.n.id}`} x1={gp.x} y1={gp.y} x2={p.x} y2={p.y} stroke={INK} strokeOpacity={lit ? 0.9 : 0.35 * a} strokeWidth={1} strokeDasharray="4 4" />;
        })}

        {/* the walked trace */}
        {traceShown.length > 1 && (
          <polyline
            points={traceShown.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none" stroke={INK} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round"
            strokeOpacity={hasHl ? 0.3 : 1}
          />
        )}

        {/* now line */}
        {nowX !== null && (
          <g>
            <line x1={nowX} x2={nowX} y1={axisY} y2={H - 48} stroke={INK} strokeWidth={1.5} strokeDasharray="6 3" />
            <rect x={nowX - 20} y={axisY - 9} width={40} height={18} rx={9} fill={YELLOW} stroke={INK} strokeWidth={2} />
            <text x={nowX} y={axisY + 4} fontSize={11} fontWeight={700} fill={INK} textAnchor="middle">now</text>
          </g>
        )}

        {/* goals header row */}
        {goals.map((g) => {
          const gp = goalPos.get(g.id)!;
          const full = titleCase(g.label);
          const text = truncate(full, phone ? 18 : 28);
          const w = textW(text, 600) + 14;
          const c = covBy.get(g.id);
          const pct = c && c.planned ? Math.min(1, c.covered / c.planned) : 0;
          const a = alphaFor(g.id);
          return (
            <g key={g.id} opacity={a} onClick={() => onNodeClick(g)} style={{ cursor: "pointer" }}>
              <title>{full}{c ? ` · ${c.covered}/${c.planned}` : ""}</title>
              <circle cx={gp.x + 2.5} cy={gp.y + 2.5} r={12} fill={INK} />
              <circle cx={gp.x} cy={gp.y} r={12} fill={NODE_COLOR.goal} stroke={INK} strokeWidth={2} />
              <rect x={gp.x - w / 2} y={gp.y + 17} width={w} height={20} rx={5} fill={highlight.has(g.id) ? YELLOW : PAPER} stroke={INK} strokeWidth={1.5} />
              <text x={gp.x} y={gp.y + 31} fontSize={12} fontWeight={600} fill={INK} textAnchor="middle">{text}</text>
              {c && (
                <g>
                  <rect x={gp.x - 30} y={gp.y + 41} width={60} height={7} rx={3.5} fill={PAPER} stroke={INK} strokeWidth={1.2} />
                  <rect x={gp.x - 29.4} y={gp.y + 41.6} width={58.8 * pct} height={5.8} rx={2.9} fill={YELLOW} />
                </g>
              )}
            </g>
          );
        })}

        {/* timeline nodes */}
        {placed.map((p) => {
          if (!shown(p.n.id)) return null;
          const { n } = p;
          const a = alphaFor(n.id, p.t);
          const color = NODE_COLOR[n.type];
          const lit = highlight.has(n.id);
          if (n.type === "moment") {
            return (
              <g key={n.id} opacity={a} onClick={() => onNodeClick(n)} style={{ cursor: "pointer" }}>
                <title>{p.full}</title>
                <circle cx={p.x} cy={p.y} r={8} fill="transparent" />
                <circle cx={p.x} cy={p.y} r={lit ? 5 : 4} fill={INK} stroke={lit ? YELLOW : INK} strokeWidth={lit ? 2 : 0} />
              </g>
            );
          }
          const planned = !p.walked;
          const w = textW(p.text) + 12;
          return (
            <g key={n.id} opacity={a} onClick={() => onNodeClick(n)} style={{ cursor: "pointer" }}>
              <title>{p.full}</title>
              {lit && <circle cx={p.x} cy={p.y} r={p.r + 5} fill="none" stroke={YELLOW} strokeWidth={3} />}
              <circle
                cx={p.x} cy={p.y} r={p.r}
                fill={planned ? PAPER : color}
                stroke={planned ? color : INK}
                strokeWidth={n.state === "unplanned" ? 3 : 2}
              />
              {planned && <circle cx={p.x} cy={p.y} r={p.r + 1.5} fill="none" stroke={INK} strokeOpacity={0.7} strokeWidth={1} />}
              <rect x={p.x - w / 2} y={p.y + p.r + 3} width={w} height={19} rx={5} fill={lit ? YELLOW : PAPER} stroke={INK} strokeOpacity={0.6} />
              <text x={p.x} y={p.y + p.r + 16.5} fontSize={12} fontWeight={500} fill={INK} textAnchor="middle">{p.text}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
