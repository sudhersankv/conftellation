"use client";
// /graph: the constellation. ?all=1 = all conferences, ?hl=a,b = highlight a why path.
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Maximize2, Play, Square, X } from "lucide-react";
import type { SkyNode, SkyNodeType } from "@/lib/types";
import { api } from "@/lib/client";
import { apiKey, useApi } from "@/lib/ui/use-api";
import { useSession } from "@/lib/ui/session-context";
import { TYPE_LABEL } from "@/lib/ui/tokens";
import { cn } from "@/lib/ui/cn";
import { buttonClass, Drawer, EmptyState, ErrorState } from "@/components/ui";
import { CREAM, INK, NODE_COLOR, YELLOW, titleCase } from "./palette";
import type { CanvasHandle } from "./ConstellationCanvas";

const TraceView = dynamic(() => import("./TraceView").then((m) => m.TraceView), { ssr: false, loading: () => <CanvasLoading /> });

const ConstellationCanvas = dynamic(() => import("./ConstellationCanvas").then((m) => m.ConstellationCanvas), {
  ssr: false,
  loading: () => <CanvasLoading />,
});

/** Graph-local type dot: flat colour with an ink outline (matches the canvas nodes). */
function Dot({ type, size = 10, hollow }: { type: SkyNodeType; size?: number; hollow?: boolean }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: hollow || type === "topic" ? "#fff" : NODE_COLOR[type], border: `2px solid ${hollow ? NODE_COLOR[type] : INK}`, boxShadow: hollow ? `0 0 0 1px ${INK}` : undefined }}
      title={TYPE_LABEL[type]}
      aria-hidden
    />
  );
}

/** White pill with a 2px ink border; `on` = ink fill with cream text. */
function pill(on = false, extra = "") {
  return cn(
    "inline-flex h-8 items-center gap-1.5 rounded-full border-2 border-[#111] px-3 text-xs font-semibold transition-transform",
    "shadow-[2px_2px_0_#111] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0_#111] disabled:opacity-50",
    on ? "bg-[#111] text-[#FFF7E8]" : "bg-white text-[#111] hover:bg-[#FFD23F]",
    extra,
  );
}

function CanvasLoading() {
  return <div className="grid size-full place-items-center text-sm font-semibold text-[#111]" role="status">Drawing your graph…</div>;
}

const LEGEND: { type: SkyNodeType; label: string }[] = [
  { type: "goal", label: "Goal" }, { type: "session", label: "Session" }, { type: "person", label: "Person" },
  { type: "booth", label: "Booth" }, { type: "moment", label: "Note" }, { type: "user", label: "Attendee" },
  { type: "conference", label: "Conference" },
];

const STATE_LABEL: Record<SkyNode["state"], string> = {
  planned: "Planned", done: "Done", unplanned: "Unplanned, you went", skipped: "Skipped", dust: "Not in your plan", anchor: "Yours",
};

const REPLAY_MS = 8000;

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export function GraphView() {
  const { userId, confId, nowIso } = useSession();
  const now = nowIso();
  const params = useSearchParams();
  const router = useRouter();
  const all = params.get("all") === "1";
  const conf = params.get("conf") || confId;
  const hlRaw = params.get("hl") ?? "";
  const highlight = useMemo(() => new Set(hlRaw.split(",").map((s) => s.trim()).filter(Boolean)), [hlRaw]);

  // Trace (time × lane) is the default and per conference; "All conferences" always uses the force-directed Web view.
  const trace = !all && params.get("view") !== "web";
  const { data, error, loading, reload } = useApi(apiKey("constellation", userId, all ? "all" : conf, now ?? "live"), () => api.constellation(userId, all ? undefined : conf, { now }));
  const { data: plan } = useApi(apiKey("plan", userId, conf, now ?? "live"), () => api.plan(userId, conf, { now }));
  const slotFrom = useMemo(() => new Map((plan?.itinerary ?? []).map((s) => [s.item.id, s.from])), [plan]);
  const [wrapRef, size] = useSize<HTMLDivElement>();
  const canvas = useRef<CanvasHandle>(null);
  const [selected, setSelected] = useState<SkyNode | null>(null);
  const [revealed, setRevealed] = useState<Set<string> | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const setParam = useCallback((k: string, v: string | null) => {
    const p = new URLSearchParams(params.toString());
    if (v === null) p.delete(k); else p.set(k, v);
    const s = p.toString();
    router.replace(s ? `/graph?${s}` : "/graph", { scroll: false });
  }, [params, router]);

  const stopReplay = useCallback(() => { timers.current.forEach(clearTimeout); timers.current = []; setRevealed(null); }, []);
  useEffect(() => stopReplay, [stopReplay]);

  const replay = useCallback(() => {
    if (!data) return;
    stopReplay();
    const base = data.nodes.filter((n) => !n.at && (n.state === "anchor" || n.type === "goal" || n.type === "problem" || n.type === "conference"));
    // Trace mode: everything on the timeline appears in time order (done at `at`, planned at its slot start).
    const tOf = (n: SkyNode) => n.at ?? (trace ? slotFrom.get(n.id) : undefined);
    const timed = data.nodes.filter((n) => tOf(n) && !base.includes(n)).sort((a, b) => Date.parse(tOf(a)!) - Date.parse(tOf(b)!));
    const rest = data.nodes.filter((n) => !tOf(n) && !base.includes(n));
    const shown = new Set(base.map((n) => n.id));
    setRevealed(new Set(shown));
    const order = [...timed, ...rest];
    const step = (REPLAY_MS - 600) / Math.max(order.length, 1);
    order.forEach((n, i) => {
      timers.current.push(setTimeout(() => { shown.add(n.id); setRevealed(new Set(shown)); }, 400 + i * step));
    });
    timers.current.push(setTimeout(() => setRevealed(null), REPLAY_MS + 400));
  }, [data, stopReplay, trace, slotFrom]);

  const byId = useMemo(() => new Map((data?.nodes ?? []).map((n) => [n.id, n])), [data]);
  const goals = useMemo(() => (data?.coverage ?? []).map((c) => ({ ...c, label: byId.get(c.goalId)?.label ?? c.goalId })), [data, byId]);
  const confName = useMemo(() => data?.nodes.find((n) => n.type === "conference" && (n.id === conf || n.conferenceId === conf))?.label
    ?? data?.nodes.find((n) => n.type === "conference")?.label ?? conf, [data, conf]);
  const hlCount = useMemo(() => [...highlight].filter((id) => byId.has(id)).length, [highlight, byId]);

  return (
    <div className="-mx-4 -mt-4 -mb-4 md:-mx-8 md:-mb-10 md:-mt-8">
      <div
        ref={wrapRef}
        className="relative h-[calc(100dvh-var(--topbar-h)-var(--nav-h)-env(safe-area-inset-bottom))] overflow-hidden md:h-dvh"
        style={{ backgroundColor: CREAM, backgroundImage: "radial-gradient(rgba(17,17,17,0.06) 1.2px, transparent 1.4px)", backgroundSize: "24px 24px" }}
      >
        {error && !data ? (
          <div className="grid size-full place-items-center p-4"><ErrorState what="your graph" detail={error.message} onRetry={reload} /></div>
        ) : loading || !data ? (
          <CanvasLoading />
        ) : data.nodes.length === 0 ? (
          <div className="grid size-full place-items-center p-4">
            <EmptyState title="Nothing here yet" text="Set goals and build a plan; your sessions, people and notes connect here." action={<Link href="/goals" className={buttonClass({ size: "sm" })}>Set goals</Link>} />
          </div>
        ) : size.w > 0 && trace ? (
          <TraceView
            nodes={data.nodes}
            links={data.links}
            itinerary={plan?.itinerary ?? []}
            coverage={data.coverage}
            width={size.w}
            height={size.h}
            highlight={highlight}
            revealed={revealed}
            nowIso={now}
            onNodeClick={setSelected}
          />
        ) : size.w > 0 && (
          <ConstellationCanvas
            handleRef={canvas}
            nodes={data.nodes}
            links={data.links}
            width={size.w}
            height={size.h}
            highlight={highlight}
            revealed={revealed}
            anchorId={userId}
            selectedId={selected?.id ?? null}
            onNodeClick={setSelected}
          />
        )}

        {/* Header (trace mode): coverage lives on the goal row of the trace itself */}
        {trace && (
          <div className="pointer-events-none absolute left-3 top-3 max-w-[calc(100%-140px)] md:left-5 md:max-w-[50%]">
            <h1 className="text-xl font-extrabold leading-6 tracking-tight text-[#111] md:text-2xl">My conftellation</h1>
            <div className="truncate text-sm font-semibold text-[#111]">{confName}</div>
            <p className="mt-0.5 hidden text-xs text-[#111]/70 md:block">Your trace through the day. Replay it, or tap a star to open it.</p>
          </div>
        )}

        {/* Coverage (top-left, web mode) */}
        {!trace && goals.length > 0 && (
          <div className="pointer-events-none absolute left-3 top-3 flex max-w-[46%] flex-col gap-1.5 md:max-w-xs">
            {goals.map((g) => {
              const pct = g.planned ? Math.min(1, g.covered / g.planned) : 0;
              return (
                <div key={g.goalId} className="pointer-events-auto rounded-lg border-2 border-[#111] bg-white px-2 py-1.5 shadow-[2px_2px_0_#111]">
                  <div className="flex items-center gap-2 text-[12px] font-semibold leading-4 text-[#111]">
                    <span className="min-w-0 flex-1 truncate" title={titleCase(g.label)}>{titleCase(g.label)}</span>
                    <span className="tabular shrink-0">{g.covered}/{g.planned}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full border-[1.5px] border-[#111] bg-white">
                    <div className="h-full" style={{ width: `${pct * 100}%`, background: YELLOW, borderRight: pct > 0 && pct < 1 ? `1.5px solid ${INK}` : undefined }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Controls (top-right) */}
        <div className="absolute right-3 top-3 flex flex-col items-end gap-2 md:flex-row md:items-center">
          {!all && (
            <div className="flex gap-1.5" role="radiogroup" aria-label="View">
              <button type="button" role="radio" aria-checked={trace} onClick={() => setParam("view", null)} className={pill(trace, "px-2.5 md:px-3")}>Trace</button>
              <button type="button" role="radio" aria-checked={!trace} onClick={() => setParam("view", "web")} className={pill(!trace, "px-2.5 md:px-3")}>Web</button>
            </div>
          )}
          <div className="flex gap-1.5" role="radiogroup" aria-label="Scope">
            <button type="button" role="radio" aria-checked={!all} onClick={() => setParam("all", null)} className={pill(!all, "px-2.5 md:px-3")}>
              <span className="md:hidden">Conf</span><span className="hidden md:inline">This conference</span>
            </button>
            <button type="button" role="radio" aria-checked={all} onClick={() => setParam("all", "1")} className={pill(all, "px-2.5 md:px-3")}>All</button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={revealed ? stopReplay : replay}
              disabled={!data}
              className={pill(!!revealed, "px-2.5 md:px-3")}
              aria-label={revealed ? "Stop replay" : "Replay day"}
              title="Replay day"
            >
              {revealed ? <Square className="size-3.5" /> : <Play className="size-3.5" />}
              <span className="hidden md:inline">{revealed ? "Stop" : "Replay day"}</span>
            </button>
            <button
              type="button"
              onClick={() => canvas.current?.zoomToFit()}
              disabled={trace}
              className={pill(false, "px-2.5 md:px-3")}
              aria-label="Reset view"
              title="Reset view"
            >
              <Maximize2 className="size-3.5" />
              <span className="hidden md:inline">Reset view</span>
            </button>
          </div>
        </div>

        {/* Highlight pill */}
        {highlight.size > 0 && (
          <div className="absolute bottom-[76px] left-1/2 z-10 -translate-x-1/2 md:bottom-auto md:top-3">
            <div className="flex items-center gap-2 whitespace-nowrap rounded-full border-2 border-[#111] bg-[#FFD23F] px-3 py-1.5 text-xs font-semibold text-[#111] shadow-[2px_2px_0_#111]">
              <span className="size-2 rounded-full border border-[#111] bg-white" aria-hidden />
              <span>Showing: why path</span>
              {hlCount === 0 && <span className="opacity-70">· not in this view</span>}
              <button type="button" onClick={() => setParam("hl", null)} className="flex items-center gap-1 underline-offset-2 hover:underline">
                · Clear <X className="size-3" />
              </button>
            </div>
          </div>
        )}

        {/* Legend (bottom-left) */}
        <div className="pointer-events-none absolute bottom-3 left-3 flex max-w-[calc(100%-24px)] flex-wrap gap-x-3 gap-y-1 rounded-lg border-2 border-[#111] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#111] shadow-[2px_2px_0_#111]">
          {LEGEND.map((l) => (
            <span key={l.type} className="flex items-center gap-1.5">
              <Dot type={l.type} size={10} />{l.label}
            </span>
          ))}
          <span className="flex items-center gap-1.5"><Dot type="session" size={10} hollow />Planned</span>
        </div>
      </div>

      <NodeDrawer node={selected} links={data?.links ?? []} byId={byId} confId={confId} onClose={() => setSelected(null)} />
    </div>
  );
}

function NodeDrawer({ node, links, byId, confId, onClose }: { node: SkyNode | null; links: { source: string; target: string; type: string }[]; byId: Map<string, SkyNode>; confId: string; onClose(): void }) {
  const { setConfId } = useSession();
  const [last, setLast] = useState<SkyNode | null>(node);
  useEffect(() => { if (node) setLast(node); }, [node]);
  const n = node ?? last;
  const neighbours = useMemo(() => {
    if (!n) return [];
    const ids = links.flatMap((l) => (l.source === n.id ? [l.target] : l.target === n.id ? [l.source] : []));
    return Array.from(new Set(ids)).map((id) => byId.get(id)).filter((x): x is SkyNode => !!x && x.state !== "skipped").slice(0, 8);
  }, [n, links, byId]);

  let href: string | null = null;
  let cta = "";
  if (n) {
    if (n.type === "session") { href = `/sessions/${encodeURIComponent(n.id)}`; cta = "Open session"; }
    else if (n.type === "person") { href = `/people/${encodeURIComponent(n.id)}`; cta = "Open person"; }
    else if (n.type === "goal" || n.type === "problem") { href = "/plan"; cta = "See plan"; }
    else if (n.type === "user" && n.isOtherUser) { href = "/network"; cta = "Open network"; }
    else if (n.type === "moment") {
      const at = links.find((l) => l.source === n.id && l.type === "AT")?.target;
      if (at && byId.get(at)?.type === "session") { href = `/sessions/${encodeURIComponent(at)}`; cta = `Open ${titleCase(byId.get(at)!.label)}`; }
    }
  }

  return (
    <Drawer
      open={!!node}
      onOpenChange={(o) => !o && onClose()}
      title={n ? titleCase(n.label) : ""}
      description={n ? TYPE_LABEL[n.type] : undefined}
    >
      {n && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="inline-flex h-6 items-center gap-1.5 rounded-md border border-border px-2"><Dot type={n.type} size={9} />{TYPE_LABEL[n.type]}</span>
            <span className="inline-flex h-6 items-center rounded-md border border-border px-2">{STATE_LABEL[n.state]}</span>
            {n.conferenceId && <span className="inline-flex h-6 items-center rounded-md border border-border px-2">{n.conferenceId}</span>}
            {typeof n.fit === "number" && <span className="tabular inline-flex h-6 items-center rounded-md border border-border px-2">fit {Math.round(n.fit * 100)}%</span>}
          </div>
          {neighbours.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">Connected to</div>
              <ul className="flex flex-col gap-1">
                {neighbours.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 text-sm text-text"><Dot type={m.type} size={9} /><span className="truncate">{titleCase(m.label)}</span></li>
                ))}
              </ul>
            </div>
          )}
          {href && (
            <Link
              href={href}
              className={cn(buttonClass({ size: "md" }), "w-full")}
              onClick={() => {
                // Plan/session pages read the session conference; switch to the node's conference first.
                if (n.conferenceId && n.conferenceId !== confId && href !== "/network") setConfId(n.conferenceId);
                onClose();
              }}
            >
              {cta}<ArrowRight className="size-4" />
            </Link>
          )}
        </div>
      )}
    </Drawer>
  );
}
