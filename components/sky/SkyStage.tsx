"use client";
// Backdrop starfield only; the live sky replaces this file.
import { useEffect, useRef } from "react";
import { COLORS } from "@/lib/ui/tokens";
import { mulberry32 } from "@/lib/ui/rand";

const STARS = (() => {
  const r = mulberry32(20261024);
  return Array.from({ length: 220 }, () => {
    const k = r();
    return { x: r(), y: r(), size: 0.3 + r() ** 3 * 1.1, alpha: 0.15 + r() * 0.55, color: k < 0.1 ? "167,139,250" : k < 0.15 ? "92,225,230" : "242,240,255" };
  });
})();

function paint(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COLORS.abyss;
  ctx.fillRect(0, 0, w, h);
  const m = Math.max(w, h);
  const wash = (x: number, y: number, r: number, rgba: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };
  wash(0.3 * w, 0.35 * h, 0.6 * m, "rgba(167,139,250,0.05)");
  wash(0.75 * w, 0.7 * h, 0.5 * m, "rgba(92,225,230,0.04)");
  for (const s of STARS) {
    ctx.fillStyle = `rgba(${s.color},${s.alpha})`;
    ctx.beginPath();
    ctx.arc(s.x * w, s.y * h, s.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function SkyStage() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    let raf = 0;
    const draw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => paint(c)); };
    draw();
    window.addEventListener("resize", draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", draw); };
  }, []);
  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-0 h-full w-full" />;
}
