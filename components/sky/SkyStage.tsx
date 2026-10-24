"use client";
// The persistent sky: one canvas for the galaxy home and every conference. Mounted once by app/(sky)/layout.tsx.
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { NodeObject } from "react-force-graph-2d";
import { GalaxyLabels } from "@/components/sky/GalaxyLabels";
import { api } from "@/lib/client";
import type { ConstellationResponse, PlanResponse, WhyPath } from "@/lib/types";
import { useSession } from "@/lib/ui/session-context";
import { useSky } from "@/lib/ui/sky-store";
import { apiKey, useApi } from "@/lib/ui/use-api";
import { buildConference, planFits, reconcile } from "@/lib/ui/sky/build";
import { buildGalaxy, slotsFor } from "@/lib/ui/sky/galaxy";
import { toHl } from "@/lib/ui/sky/highlight";
import { applyForces, isSun, type Pos } from "@/lib/ui/sky/layout";
import { makeBackdrop, makePainters } from "@/lib/ui/sky/paint";
import { dayKey } from "@/lib/ui/sky/time";
import type { FG, GNode, GraphData, LinkDef, Scene } from "@/lib/ui/sky/types";
import { useGalaxy } from "@/lib/ui/sky/use-galaxy";
import { useSkyView } from "@/lib/ui/sky/view-store";

const SkyCanvas = dynamic(() => import("./SkyCanvas"), { ssr: false });

const EMPTY: ConstellationResponse = { nodes: [], links: [], coverage: [] };

function initialScene(home: boolean, getFg: () => FG | undefined): Scene {
  const mode = home ? "galaxy" : "conference";
  const s: Scene = {
    mode, confId: null, byId: new Map(), hl: null, pulses: new Map(), lit: new Set(), replay: null, scope: "all", today: dayKey(new Date()),
    asterism: [], coverage: new Map(), fly: null, zoomK: 1, reduced: false, lowPower: false, focusId: null,
    fonts: { sans: "system-ui, sans-serif", name: "serif" }, labelEls: new Map(), slots: new Map(), todayConf: null,
    backdrop: makeBackdrop(mode), getFg, visible: () => true,
  };
  s.visible = (n) => {
    const gal = n.id.indexOf("::") > 0;
    if (gal !== (s.mode === "galaxy")) return false;
    if (n.state === "skipped" && !n._exitAt) return false;
    if (s.mode === "conference" && s.scope === "today") {
      if (n.state === "dust") return false;
      if (n.at && dayKey(n.at) !== s.today) return false;
    }
    if (s.replay && n.at && Date.parse(n.at) > s.replay.cursor) return false;
    return true;
  };
  return s;
}

export function SkyStage() {
  const pathname = usePathname();
  const router = useRouter();
  const { userId, confId, setConfId, now, nowIso } = useSession();
  const home = pathname === "/";
  const fgRef = useRef<FG>();
  const sceneRef = useRef<Scene>();
  if (!sceneRef.current) sceneRef.current = initialScene(home, () => fgRef.current);
  const scene = sceneRef.current;
  const [painters] = useState(() => makePainters(scene));
  const [graph, setGraph] = useState<GraphData>({ nodes: [], links: [] });
  const [stageMode, setStageMode] = useState(scene.mode);
  const [opacity, setOpacity] = useState(1);
  const [summary, setSummary] = useState("Your sky");
  const covered = useSky((s) => s.covered);

  const ctl = useRef({
    cachedPos: new Map<string, Map<string, Pos>>(), defs: [] as LinkDef[], kind: "none" as "none" | "galaxy" | "conference",
    builtFor: null as string | null, framedFor: null as string | null, scopedFor: null as string | null, galaxyData: null as unknown,
    pending: [] as { id: string; at: number }[], wantGalaxy: false, pendingFocus: null as string | null, pendingFly: null as string | null, fitted: null as unknown,
    exitTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  }).current;

  const consKey = home ? null : apiKey("constellation", userId, confId);
  const planKey = home ? null : apiKey("plan", userId, confId, nowIso());
  const cons = useApi(consKey, () => api.constellation(userId, confId));
  const plan = useApi(planKey, () => api.plan(userId, confId, { now: nowIso() }));
  const galaxy = useGalaxy();

  // ---- helpers (re-created per render, reached from long-lived callbacks through F.current) ----
  const whenFg = (fn: (fg: FG) => void, tries = 40) => {
    const fg = fgRef.current;
    if (fg) fn(fg); else if (tries > 0) setTimeout(() => whenFg(fn, tries - 1), 100);
  };
  // sync=true only from timers: flushSync warns inside effects
  const pushGraph = (nodes: GNode[], defs: LinkDef[], mode: "galaxy" | "conference", sync = false) => {
    const ids = new Set(nodes.map((n) => n.id));
    const ok = defs.filter((d) => ids.has(d.source) && ids.has(d.target));
    ctl.defs = ok;
    scene.byId = new Map(nodes.map((n) => [n.id, n]));
    const commit = () => { setStageMode(mode); setGraph({ nodes, links: ok.map((d) => ({ ...d })) }); };
    if (sync) flushSync(commit); else commit();
  };
  const crossFade = (fn: () => void) => { setOpacity(0); setTimeout(() => { fn(); setOpacity(1); }, 200); };
  const cachePositions = (conf: string) => {
    const m = new Map<string, Pos>();
    for (const n of scene.byId.values()) if (n.x != null && n.y != null && n.id.indexOf("::") < 0) m.set(n._orig, { x: n.x, y: n.y });
    if (m.size) ctl.cachedPos.set(conf, m);
  };
  const snapshot = (resp: ConstellationResponse) => useSkyView.setState({ nodes: resp.nodes, links: resp.links, coverage: resp.coverage });
  const defaultScope = (resp: ConstellationResponse, conf: string) => {
    if (ctl.scopedFor === conf) return;
    ctl.scopedFor = conf;
    const any = resp.nodes.some((n) => n.at && dayKey(n.at) === scene.today);
    useSkyView.setState({ scope: any ? "today" : "all" });
  };
  const setHl = (path: WhyPath | null) => {
    scene.hl = path ? toHl(path, (id) => scene.byId.has(id), performance.now()) : null;
  };
  const fitHl = () => {
    const hl = scene.hl, fg = fgRef.current;
    if (!hl || !fg) return;
    ctl.fitted = hl; hl.t0 = performance.now();
    if (![...scene.byId.values()].some((n) => hl.nodes.has(n._orig))) return;
    fg.resumeAnimation();
    // like zoomToFit but never closer than 2.2x: a two-star path would otherwise fill the screen
    const bb = fg.getGraphBbox((n) => hl.nodes.has((n as GNode)._orig) && scene.visible(n as GNode));
    const ms = scene.reduced ? 0 : 700, pad = 80;
    const k = Math.min(2.2, (window.innerWidth - 2 * pad) / Math.max(1, bb.x[1] - bb.x[0]), (window.innerHeight - 2 * pad - 160) / Math.max(1, bb.y[1] - bb.y[0]));
    fg.centerAt((bb.x[0] + bb.x[1]) / 2, (bb.y[0] + bb.y[1]) / 2 + 30 / k, ms);
    fg.zoom(k, ms);
  };
  // all rings in view, leaving room for the title above and the labels + add pill below
  const fitGalaxy = (fg: FG, ms: number) => {
    const sl = [...scene.slots.values()];
    if (!sl.length) return;
    const x0 = Math.min(...sl.map((v) => v.x - 165 * v.s)), x1 = Math.max(...sl.map((v) => v.x + 165 * v.s));
    const y0 = Math.min(...sl.map((v) => v.y - 165 * v.s)), y1 = Math.max(...sl.map((v) => v.y + 165 * v.s));
    const k = Math.min((window.innerWidth - 32) / (x1 - x0), (window.innerHeight - 64 - 170) / (y1 - y0), 1.2);
    fg.centerAt((x0 + x1) / 2, (y0 + y1) / 2 + 53 / k, ms);
    fg.zoom(k, ms);
  };
  const prune = () => {
    clearTimeout(ctl.exitTimer);
    ctl.exitTimer = setTimeout(() => {
      const keep = [...scene.byId.values()].filter((n) => !n._exitAt);
      if (keep.length !== scene.byId.size) pushGraph(keep, ctl.defs, scene.mode, true);
    }, 450);
  };
  const frame = (resp: ConstellationResponse) => {
    const ats = resp.nodes.filter((n) => n.at);
    const today = scene.today, nowMs = now().getTime();
    const live = ats.some((n) => dayKey(n.at!) === today);
    const remember = !live && ats.length > 0 && ats.every((n) => dayKey(n.at!) < today);
    if (remember) useSkyView.setState({ pulseReplay: true });
    const recent = (n: GNode) => !n.at || (Date.parse(n.at) >= nowMs - 3 * 3600e3 && Date.parse(n.at) <= nowMs + 3600e3);
    const hasRecent = live && resp.nodes.some((n) => n.state !== "dust" && n.at && recent(n as GNode));
    const filter = (o: NodeObject<GNode>) => {
      const n = o as GNode;
      return n.state !== "dust" && (!hasRecent || isSun(n) || recent(n));
    };
    setTimeout(() => whenFg((fg) => { fg.resumeAnimation(); fg.zoomToFit(scene.reduced ? 0 : 500, 60, filter); }), 120);
  };

  const applyConference = (resp: ConstellationResponse, pl?: PlanResponse) => {
    const fresh = ctl.kind !== "conference" || ctl.builtFor !== confId;
    if (fresh) {
      scene.byId = new Map(); scene.lit.clear(); scene.pulses.clear();
      ctl.builtFor = confId;
      if (scene.mode !== "conference") { scene.mode = "conference"; scene.backdrop = makeBackdrop("conference"); }
      scene.today = dayKey(now());
      whenFg((fg) => applyForces(fg, "conference"));
    }
    scene.confId = confId;
    const fits = planFits(pl);
    const built = buildConference(resp, { confId, fits, cached: ctl.cachedPos.get(confId) });
    const { nodes, changed } = reconcile(scene.byId, built.nodes, performance.now(), scene.reduced);
    scene.coverage = built.coverage;
    const ids = new Set(resp.nodes.map((n) => n.id));
    scene.asterism = pl ? pl.itinerary.map((s) => s.item.id).filter((id) => ids.has(id)) : [];
    snapshot(resp);
    if (changed || fresh) {
      ctl.kind = "conference";
      pushGraph(nodes, built.defs, "conference");
      if (nodes.some((n) => n._exitAt)) prune();
    }
    const goals = resp.nodes.filter((n) => n.type === "goal").length;
    setSummary(`${goals} goals, ${resp.nodes.filter((n) => n.state === "planned").length} planned, ${resp.nodes.filter((n) => n.state === "done").length} done`);
    defaultScope(resp, confId);
    if (ctl.framedFor !== confId) { ctl.framedFor = confId; frame(resp); }
    const hl = useSky.getState().highlight;
    if (hl) setHl(hl);
    if (ctl.pendingFocus) { const id = ctl.pendingFocus; ctl.pendingFocus = null; onFocus(id); }
  };

  const onFocus = (id: string | null) => {
    scene.focusId = id;
    if (!id) return;
    const n = scene.byId.get(id), fg = fgRef.current;
    if (!n || !fg || n.x == null) { ctl.pendingFocus = id; return; }
    fg.resumeAnimation();
    fg.centerAt(n.x, n.y! + (0.2 * window.innerHeight) / fg.zoom(), scene.reduced ? 0 : 500);
  };

  const showGalaxy = (o: { handoff: boolean; animate: boolean; fit: boolean }) => {
    const data = galaxy.data;
    if (!data) { ctl.wantGalaxy = true; return; }
    ctl.wantGalaxy = false;
    const fg = fgRef.current;
    const fromConf = scene.mode === "conference" && ctl.kind === "conference" ? scene.confId : null;
    if (fromConf) cachePositions(fromConf);
    const cam = fg && fromConf ? { c: fg.centerAt(), k: fg.zoom() } : null;
    const { slots, todayId } = slotsFor(data.record, now());
    const run = () => {
      scene.slots = slots; scene.todayConf = todayId; scene.mode = "galaxy"; scene.hl = null; scene.fly = null;
      scene.lit.clear(); scene.pulses.clear(); scene.replay = null; scene.focusId = null;
      scene.backdrop = makeBackdrop("galaxy");
      const g = buildGalaxy(data.record, data.byConf, slots, ctl.cachedPos);
      ctl.kind = "galaxy"; ctl.galaxyData = data;
      pushGraph(g.nodes, g.defs, "galaxy", true);
      if (ctl.pendingFly) { const id = ctl.pendingFly; ctl.pendingFly = null; setTimeout(() => F.current.onFly(id), 400); }
      setSummary(`${data.record.conferences.length} conferences in your sky`);
      whenFg((f) => {
        applyForces(f, "galaxy");
        const slot = fromConf ? slots.get(fromConf) : undefined;
        if (o.handoff && cam && slot) { f.centerAt(slot.x + slot.s * cam.c.x, slot.y + slot.s * cam.c.y, 0); f.zoom(cam.k / slot.s, 0); }
        if (o.fit) setTimeout(() => whenFg((f2) => fitGalaxy(f2, o.animate && !scene.reduced ? 1100 : 0)), 60);
      });
    };
    if (o.animate && scene.reduced) crossFade(run); else setTimeout(run, 0);
    if (window.location.pathname !== "/") setTimeout(() => { if (window.location.pathname !== "/") router.replace("/"); }, 300);
  };

  const handoff = (id: string) => {
    const fg = fgRef.current;
    const slot = scene.slots.get(id);
    const cam = fg ? { c: fg.centerAt(), k: fg.zoom() } : null;
    const resp = galaxy.data?.byConf[id] ?? EMPTY;
    const built = buildConference(resp, { confId: id, fits: new Map(), cached: ctl.cachedPos.get(id) });
    built.nodes.forEach((n) => { n.fx = n.x; n.fy = n.y; }); // keep the galaxy layout: nothing jumps when forces take over
    scene.mode = "conference"; scene.fly = null; scene.confId = id; scene.hl = null; scene.lit.clear(); scene.pulses.clear();
    scene.coverage = built.coverage; scene.asterism = []; scene.today = dayKey(now());
    scene.backdrop = makeBackdrop("conference");
    ctl.kind = "conference"; ctl.builtFor = id; ctl.framedFor = id;
    pushGraph(built.nodes, built.defs, "conference", true);
    snapshot(resp); defaultScope(resp, id);
    if (fg) {
      applyForces(fg, "conference");
      if (slot && cam) { fg.centerAt((cam.c.x - slot.x) / slot.s, (cam.c.y - slot.y) / slot.s, 0); fg.zoom(cam.k * slot.s, 0); }
    }
    setConfId(id);
    useSky.getState().setMode("conference", id);
    router.replace("/sky");
  };

  const onFly = (id: string) => {
    useSky.setState({ flyTarget: null });
    if (scene.mode !== "galaxy") { if (id !== scene.confId) setConfId(id); return; }
    if (scene.fly) return;
    if (!galaxy.data || !scene.slots.has(id)) { ctl.pendingFly = id; return; } // flown once the galaxy has been laid out
    if (scene.reduced) { crossFade(() => handoff(id)); return; }
    scene.fly = { conf: id, t0: performance.now() };
    fgRef.current?.resumeAnimation();
    setTimeout(() => fgRef.current?.zoomToFit(950, 60, (n) => (n as GNode)._conf === id), 150);
    setTimeout(() => handoff(id), 1100);
  };

  const flushPending = () => {
    if (pathname !== "/sky" || covered || scene.mode !== "conference") return;
    const t = performance.now();
    ctl.pending = ctl.pending.filter((p) => t - p.at < 120000);
    const hit = ctl.pending.filter((p) => scene.byId.has(p.id));
    if (!hit.length) return;
    hit.forEach((p) => { if (scene.reduced) scene.lit.add(p.id); else scene.pulses.set(p.id, t); });
    ctl.pending = ctl.pending.filter((p) => !scene.byId.has(p.id));
    if (!scene.reduced) navigator.vibrate?.(12);
  };

  const fns = { onFocus, onFly, showGalaxy, setHl, fitHl, consReload: cons.reload, pathname, ctl, now };
  const F = useRef(fns);
  F.current = fns;

  // ---- effects ----
  const onReady = useCallback((fg: FG) => applyForces(fg, scene.mode), [scene]);

  useEffect(() => {
    const el = document.documentElement, cs = getComputedStyle(el);
    const sans = cs.getPropertyValue("--font-geist-sans").trim(), name = cs.getPropertyValue("--font-caslon-text").trim();
    scene.fonts = { sans: sans ? `${sans}, system-ui, sans-serif` : scene.fonts.sans, name: name ? `${name}, serif` : "serif" };
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => { scene.reduced = mq.matches; useSkyView.setState({ reduced: mq.matches }); };
    on(); mq.addEventListener("change", on);
    const tick = setInterval(() => { scene.today = dayKey(F.current.now()); }, 60000);
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __sky: unknown }).__sky = {
        store: useSky, pulse: (ids: string[]) => useSky.getState().pulse(ids),
        showPath: (p: WhyPath, label = "Back") => useSky.getState().showPath(p, label), focus: (id: string | null) => useSky.getState().focus(id),
      };
    }
    return () => { mq.removeEventListener("change", on); clearInterval(tick); };
  }, [scene]);

  useEffect(() => {
    const unsubView = useSkyView.subscribe((s) => {
      scene.scope = s.scope;
      scene.replay = s.replay ? { from: s.replay.from, to: s.replay.to, cursor: s.replay.cursor } : null;
    });
    const unsub = useSky.subscribe((s, p) => {
      const f = F.current;
      if (s.highlight !== p.highlight) {
        f.setHl(s.highlight);
        if (s.highlight) { if (s.focusId) useSky.getState().focus(null); if (f.pathname === "/sky") f.fitHl(); }
      }
      if (s.pulses !== p.pulses && s.pulses.length) {
        const t = performance.now();
        s.pulses.forEach((x) => f.ctl.pending.push({ id: x.id, at: t }));
        useSky.setState({ pulses: [] });
        void f.consReload();
      }
      if (s.focusId !== p.focusId) f.onFocus(s.focusId);
      if (s.flyTarget && s.flyTarget !== p.flyTarget) f.onFly(s.flyTarget);
      if (s.mode !== p.mode && s.mode === "galaxy" && scene.mode === "conference" && !scene.fly) f.showGalaxy({ handoff: true, animate: true, fit: true });
    });
    return () => { unsub(); unsubView(); };
  }, [scene]);

  // conference data -> graph
  useEffect(() => {
    if (home || !cons.data) return;
    applyConference(cons.data, plan.data);
  }, [cons.data, plan.data, confId, home]); // eslint-disable-line react-hooks/exhaustive-deps

  // galaxy -> graph, and the zoom-out when we land on / from a conference
  useEffect(() => {
    if (!galaxy.data || scene.fly) return;
    if (ctl.wantGalaxy || (home && ctl.kind === "conference")) showGalaxy({ handoff: true, animate: true, fit: true });
    else if (home && ctl.kind !== "galaxy") showGalaxy({ handoff: false, animate: false, fit: true });
    else if (ctl.kind === "galaxy" && ctl.galaxyData !== galaxy.data) showGalaxy({ handoff: false, animate: false, fit: false });
  }, [galaxy.data, home]); // eslint-disable-line react-hooks/exhaustive-deps

  // entering /sky: refresh so steer changes made elsewhere animate in/out; replay highlight and focus
  useEffect(() => {
    if (pathname !== "/sky") return;
    void cons.reload(); void plan.reload();
    if (scene.hl && ctl.fitted !== scene.hl) fitHl();
    const id = useSky.getState().focusId;
    if (id) onFocus(id);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { flushPending(); }, [graph, pathname, covered]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const paused = covered && pathname !== "/sky" && pathname !== "/";
    whenFg((fg) => { if (paused) fg.pauseAnimation(); else fg.resumeAnimation(); });
  }, [covered, pathname, graph]); // eslint-disable-line react-hooks/exhaustive-deps

  const interactive = pathname === "/" || pathname === "/sky";
  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-0 bg-abyss">
        <div
          role="img"
          aria-label={summary}
          className={`absolute inset-0 transition-opacity duration-200 ${interactive ? "pointer-events-auto" : "pointer-events-none"}`}
          style={{ opacity, touchAction: "none" }}
        >
          <SkyCanvas
            fgRef={fgRef}
            data={graph}
            mode={stageMode}
            painters={painters}
            visible={scene.visible}
            onNodeClick={(n) => {
              if (scene.mode === "galaxy") useSky.getState().flyTo(n._conf);
              else if (n.type !== "user" || n.isOtherUser) useSky.getState().focus(n._orig);
            }}
            onBackgroundClick={() => { if (scene.mode === "conference") { useSky.getState().clearHighlight(); useSky.getState().focus(null); } }}
            onEngineStop={() => { if (scene.mode === "conference" && scene.confId) cachePositions(scene.confId); }}
            onReady={onReady}
          />
        </div>
      </div>
      {stageMode === "galaxy" && <GalaxyLabels scene={scene} />}
    </>
  );
}
