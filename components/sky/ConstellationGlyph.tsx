"use client";
// The conference's MST outline, shrunk to fit the top bar.
import { useMemo } from "react";
import { mulberry32, hashSeed } from "@/lib/ui/rand";
import { mst, pickShape } from "@/lib/ui/sky/galaxy";
import { seedLayout } from "@/lib/ui/sky/layout";
import { useGalaxy } from "@/lib/ui/sky/use-galaxy";

export function ConstellationGlyph({ confId, size = 20 }: { confId: string; size?: number }) {
  const g = useGalaxy();
  const resp = g.data?.byConf[confId];
  const { pts, lines } = useMemo(() => {
    let raw: { x: number; y: number }[];
    if (resp && resp.nodes.length) {
      const shape = pickShape(resp.nodes);
      const placed = seedLayout(resp.nodes, confId);
      raw = shape.map((n) => placed.get(n.id)!).filter(Boolean);
    } else raw = [];
    if (raw.length < 3) {
      const r = mulberry32(hashSeed(confId));
      raw = Array.from({ length: 3 }, () => ({ x: r(), y: r() }));
    }
    const xs = raw.map((p) => p.x), ys = raw.map((p) => p.y);
    const x0 = Math.min(...xs), y0 = Math.min(...ys), span = Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0, 1e-6);
    const pad = 2.5, k = (size - pad * 2) / span;
    const pts = raw.map((p) => ({ x: pad + (p.x - x0) * k, y: pad + (p.y - y0) * k }));
    return { pts, lines: mst(pts) };
  }, [resp, confId, size]);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0 text-polaris">
      {lines.map(([a, b], i) => <line key={i} x1={pts[a].x} y1={pts[a].y} x2={pts[b].x} y2={pts[b].y} stroke="currentColor" strokeOpacity={0.6} strokeWidth={1} />)}
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={1.5} fill="#F2F0FF" />)}
    </svg>
  );
}
