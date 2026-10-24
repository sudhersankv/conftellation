import { clamp, hash, rng } from "./seed";
import { isSun } from "./layout";
import type { GLink, GNode, Scene } from "./types";

const TAU = Math.PI * 2;
const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

const sprites = new Map<string, HTMLCanvasElement>();
/** One pre-rendered radial glow per colour; drawImage is far cheaper than shadowBlur. */
export function glowSprite(hex: string) {
  let c = sprites.get(hex);
  if (c) return c;
  c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d")!, grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, hex); grd.addColorStop(0.25, hex + "99"); grd.addColorStop(1, hex + "00");
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64); sprites.set(hex, c);
  return c;
}

/** Seeded starfield in graph space: x, y, size (screen px), alpha. */
export function makeBackdrop(mode: "galaxy" | "conference") {
  const n = mode === "galaxy" ? 400 : 220, span = mode === "galaxy" ? 3000 : 900;
  const r = rng(hash("backdrop:" + mode)), out = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    out[i * 4] = (r() * 2 - 1) * span; out[i * 4 + 1] = (r() * 2 - 1) * span;
    out[i * 4 + 2] = 0.6 + r() * 0.8; out[i * 4 + 3] = 0.25 + r() * 0.45;
  }
  return out;
}

export function makePainters(scene: Scene) {
  const slotScale = (n: GNode) => scene.slots.get(n._conf)?.s ?? 1;
  const live = () => !scene.reduced && !scene.lowPower;
  let last = 0, sum = 0, count = 0, slow = 0;

  function flyFade(n: GNode, t: number) {
    return scene.fly && n._conf !== scene.fly.conf ? 1 - clamp((t - scene.fly.t0) / 400) : 1;
  }
  function galaxyAlpha(n: GNode, t: number) {
    let a = n._slotAlpha ?? 1;
    if (!(n._shape || n.type === "conference" || isSun(n))) a *= clamp((scene.zoomK * slotScale(n) - 0.3) / 0.6);
    return a * flyFade(n, t);
  }
  function labelAlpha(conf: string, t: number) {
    const s = scene.slots.get(conf);
    if (!s) return 0;
    return s.alpha * (scene.fly ? 1 - clamp((t - scene.fly.t0) / 400) : 1);
  }

  function showLabel(n: GNode, scale: number) {
    if (scene.mode === "galaxy" || n.state === "dust") return false;
    if (scene.hl?.nodes.has(n._orig) || scene.focusId === n._orig) return true;
    switch (n.type) {
      case "goal": case "problem": return true;
      case "session": case "person": case "booth": case "company": case "meet": return scale >= 1.6;
      case "topic": return scale >= 3;
      default: return false;
    }
  }

  function paintLabel(n: GNode, ctx: CanvasRenderingContext2D, scale: number, r: number, a: number) {
    ctx.font = isSun(n) ? `italic 400 ${13 / scale}px ${scene.fonts.name}` : `500 ${12 / scale}px ${scene.fonts.sans}`;
    ctx.fillStyle = "#F2F0FF"; ctx.globalAlpha = 0.85 * a;
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText(n._label, n.x!, n.y! + r + 3 / scale);
  }

  function spikes(n: GNode, ctx: CanvasRenderingContext2D, r: number, scale: number) {
    const L = r * 2.2;
    ctx.strokeStyle = n._color; ctx.lineWidth = 0.6 / scale;
    ctx.beginPath();
    ctx.moveTo(n.x! - L, n.y!); ctx.lineTo(n.x! + L, n.y!);
    ctx.moveTo(n.x!, n.y! - L); ctx.lineTo(n.x!, n.y! + L);
    ctx.stroke();
  }

  function paintAnchor(n: GNode, ctx: CanvasRenderingContext2D, scale: number, t: number) {
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(n.x!, n.y!, 2, 0, TAU); ctx.fill();
    const rot = scene.reduced ? 0 : (t / 12000) * TAU;
    ctx.strokeStyle = "#F2F0FF"; ctx.lineWidth = 0.8 / scale;
    ctx.setLineDash([2 / scale, 3 / scale]); ctx.lineDashOffset = -rot * 7;
    ctx.beginPath(); ctx.arc(n.x!, n.y!, 7, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  }

  function paintBinary(n: GNode, ctx: CanvasRenderingContext2D, t: number) {
    const a = scene.reduced ? 0 : (t / 6000) * TAU;
    ctx.fillStyle = n._color;
    for (let i = 0; i < 2; i++) {
      const th = a + i * Math.PI;
      ctx.beginPath(); ctx.arc(n.x! + 3 * Math.cos(th), n.y! + 3 * Math.sin(th), 2.5, 0, TAU); ctx.fill();
    }
  }

  /** Progress of the lit pulse in units of 900 ms (>= 1 means switched to done), or -1 when idle. */
  function pulseState(n: GNode, t: number) {
    const t0 = scene.pulses.get(n.id);
    if (t0 === undefined) return -1;
    const p = (t - t0) / 900;
    if (p >= 1) scene.lit.add(n.id);
    if (p >= 1.33) scene.pulses.delete(n.id);
    return p;
  }

  function paintNode(node: object, ctx: CanvasRenderingContext2D, scale: number) {
    const n = node as GNode;
    if (n.x == null || n.y == null || !scene.visible(n)) return;
    const t = performance.now();
    const gal = scene.mode === "galaxy";
    const st = scene.lit.has(n.id) ? "done" : n.state;
    let a = 1, k = 1;
    if (n._enterAt) { const p = clamp((t - n._enterAt) / 500); a *= p; k *= 1 + 0.6 * (1 - p); if (p >= 1) n._enterAt = undefined; }
    if (n._exitAt) { const p = clamp((t - n._exitAt) / 400); a *= 1 - p; k *= 1 - p; }
    if (scene.hl && !scene.hl.nodes.has(n._orig)) a *= 0.15;
    if (gal) a *= galaxyAlpha(n, t);
    if (st === "dust") {
      ctx.globalAlpha = 0.25 * a; ctx.fillStyle = "#8C93B8";
      const d = 1 / scale; ctx.fillRect(n.x - d / 2, n.y - d / 2, d, d); ctx.globalAlpha = 1;
      return;
    }
    const pp = pulseState(n, t);
    const flare = pp >= 1 && pp < 1.33 ? 1 + 0.4 * Math.sin((Math.PI * (pp - 1)) / 0.33) : 1;
    const r = n._r * k * (gal ? slotScale(n) : 1) * flare;
    if (st === "done" && live()) a *= 1 + 0.08 * Math.sin((t / n._period) * TAU + n._phase);
    a = clamp(a);
    if (n.type === "conference") {
      const tw = scene.todayConf === n._conf && live() ? 0.85 + 0.15 * Math.sin((t / 6000) * TAU) : 1;
      ctx.globalAlpha = a * 0.22 * tw; ctx.strokeStyle = "#F2F0FF"; ctx.lineWidth = 0.8 / scale;
      ctx.beginPath(); ctx.arc(n.x, n.y, 165 * slotScale(n), 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }
    ctx.globalAlpha = a;
    if (st === "planned") {
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, TAU);
      ctx.globalAlpha = 0.6 * a; ctx.strokeStyle = n._color; ctx.lineWidth = 1.25 / scale; ctx.stroke();
    } else if (st === "anchor" && n.type === "user") {
      paintAnchor(n, ctx, scale, t);
    } else if (n.type === "meet") {
      paintBinary(n, ctx, t);
    } else {
      ctx.globalAlpha = 0.55 * a; ctx.drawImage(glowSprite(n._color), n.x - r * 3, n.y - r * 3, r * 6, r * 6);
      ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, TAU); ctx.fillStyle = "#fff"; ctx.fill();
      if (st === "unplanned" && !scene.lowPower) spikes(n, ctx, r, scale);
    }
    if (pp >= 0 && pp < 1 && !scene.reduced) {
      ctx.globalAlpha = 0.8 * (1 - pp); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5 / scale;
      ctx.beginPath(); ctx.arc(n.x, n.y, r * (1 + 3 * pp), 0, TAU); ctx.stroke();
    }
    if (showLabel(n, scale)) paintLabel(n, ctx, scale, r, a);
    ctx.globalAlpha = 1;
  }

  function paintHit(node: object, color: string, ctx: CanvasRenderingContext2D, scale: number) {
    const n = node as GNode;
    if (n.x == null || n.y == null || n.state === "dust" || n._exitAt || !scene.visible(n)) return;
    ctx.fillStyle = color; ctx.beginPath();
    ctx.arc(n.x, n.y, Math.max(n._hitR ?? n._r, 22 / scale), 0, TAU); ctx.fill();
  }

  function paintLink(link: object, ctx: CanvasRenderingContext2D, scale: number) {
    const l = link as GLink, a = l.source as GNode, b = l.target as GNode;
    if (a.x == null || b.x == null || a.y == null || b.y == null) return;
    const t = performance.now();
    let alpha: number, w = 0.6 / scale, color = "#2A3366";
    if (l.type === "SHAPE") {
      const fl = scene.fly && a._conf === scene.fly.conf;
      const center = scene.slots.get(a._conf)?.s === 1;
      alpha = (fl ? 1 : center ? 0.6 : 0.35) * (a._slotAlpha ?? 1) * flyFade(a, t); color = "#F2F0FF"; w = 0.8 / scale;
    } else if (l.type === "MET") { alpha = 0.7; color = "#FF8A5B"; }
    else if (l.type === "REQUESTED_MEET") { alpha = 0.7; color = "#5CE1E6"; }
    else alpha = 0.5;
    if (scene.hl) alpha *= 0.15;
    const ex = a._exitAt ?? b._exitAt;
    if (ex) alpha *= 1 - clamp((t - ex) / 400);
    ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function wash(ctx: CanvasRenderingContext2D, x: number, y: number, rgb: string, alpha: number) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, 260);
    g.addColorStop(0, `rgba(${rgb},${alpha})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - 260, y - 260, 520, 520);
  }

  function paintPre(ctx: CanvasRenderingContext2D, scale: number) {
    scene.zoomK = scale;
    const bd = scene.backdrop;
    ctx.fillStyle = "#F2F0FF";
    for (let i = 0; i < bd.length; i += 4) {
      const s = bd[i + 2] / scale;
      ctx.globalAlpha = bd[i + 3]; ctx.fillRect(bd[i], bd[i + 1], s, s);
    }
    ctx.globalAlpha = 1;
    const dim = scene.hl ? 0.15 : 1;
    if (scene.mode === "galaxy") {
      const c = scene.slots.get(scene.todayConf ?? "");
      if (c && !scene.lowPower) { wash(ctx, c.x, c.y, "167,139,250", 0.05); wash(ctx, c.x + 160, c.y + 140, "92,225,230", 0.04); }
      return;
    }
    const suns: GNode[] = [];
    for (const n of scene.byId.values()) if (isSun(n) && n.x != null) suns.push(n);
    if (!scene.lowPower && suns.length) {
      wash(ctx, suns[0].x!, suns[0].y!, "167,139,250", 0.05);
      const b = suns[1] ?? suns[0]; wash(ctx, b.x!, b.y!, "92,225,230", 0.04);
    }
    for (const s of suns) {
      if (s.type !== "goal") continue;
      const c = scene.coverage.get(s.id);
      if (c === undefined) continue;
      const hlDim = scene.hl && !scene.hl.nodes.has(s._orig) ? dim : 1;
      if (c > 0) {
        const rad = 18 + 30 * c, g = ctx.createRadialGradient(s.x!, s.y!, 0, s.x!, s.y!, rad);
        g.addColorStop(0, `rgba(255,200,97,${(0.15 + 0.45 * c) * hlDim})`); g.addColorStop(1, "rgba(255,200,97,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x!, s.y!, rad, 0, TAU); ctx.fill();
      } else {
        ctx.globalAlpha = 0.5 * hlDim; ctx.strokeStyle = "#FFC861"; ctx.lineWidth = 0.8 / scale;
        ctx.beginPath(); ctx.arc(s.x!, s.y!, 14, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
      }
    }
    // your day, drawn as an asterism: solid once reached, dashed ahead
    const ast = scene.asterism;
    if (ast.length > 1) {
      ctx.strokeStyle = "#A78BFA"; ctx.lineWidth = 1.2 / scale;
      for (let i = 1; i < ast.length; i++) {
        const a = scene.byId.get(ast[i - 1]), b = scene.byId.get(ast[i]);
        if (!a || !b || a.x == null || b.x == null || !scene.visible(a) || !scene.visible(b)) continue;
        const done = b.state === "done" || scene.lit.has(b.id);
        ctx.globalAlpha = dim * (b._exitAt ? 0.3 : 1);
        ctx.setLineDash(done ? [] : [3 / scale, 4 / scale]);
        ctx.beginPath(); ctx.moveTo(a.x, a.y!); ctx.lineTo(b.x, b.y!); ctx.stroke();
      }
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
  }

  function paintPost(ctx: CanvasRenderingContext2D, scale: number) {
    const t = performance.now();
    const hl = scene.hl;
    if (hl && scene.mode === "conference") {
      const m = hl.segs.length, p = scene.reduced ? 1 : ease(clamp((t - hl.t0) / 900));
      ctx.lineWidth = 2 / scale; ctx.globalAlpha = 1;
      for (let i = 0; i < m; i++) {
        const a = scene.byId.get(hl.segs[i][0]), b = scene.byId.get(hl.segs[i][1]);
        if (!a || !b || a.x == null || b.x == null) continue;
        const q = clamp(p * m - i);
        if (q <= 0) continue;
        ctx.strokeStyle = a._color;
        ctx.beginPath(); ctx.moveTo(a.x, a.y!); ctx.lineTo(a.x + (b.x - a.x) * q, a.y! + (b.y! - a.y!) * q); ctx.stroke();
      }
    }
    if (scene.mode === "galaxy") {
      const fg = scene.getFg();
      if (fg) for (const [conf, el] of scene.labelEls) {
        const s = scene.slots.get(conf);
        if (!s) continue;
        const { x, y } = fg.graph2ScreenCoords(s.x, s.y + s.s * 175);
        const al = labelAlpha(conf, t);
        el.style.transform = `translate(${x}px, ${y}px) translate(-50%, 0)`;
        el.style.opacity = String(al);
        el.style.visibility = al < 0.02 ? "hidden" : "visible";
      }
    }
    if (last) {
      const dt = t - last;
      if (dt < 250) {
        sum += dt; count++;
        if (count >= 60) { slow = sum / count > 25 ? slow + 1 : 0; if (slow >= 2) scene.lowPower = true; sum = 0; count = 0; }
      }
    }
    last = t;
  }

  return { paintNode, paintHit, paintLink, paintPre, paintPost };
}
export type Painters = ReturnType<typeof makePainters>;
