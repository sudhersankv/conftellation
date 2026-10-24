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
import { TYPE_COLOR, TYPE_LABEL } from "@/lib/ui/tokens";
import { cn } from "@/lib/ui/cn";
import { buttonClass, Drawer, EmptyState, ErrorState, Segmented, TypeDot } from "@/components/ui";
import type { CanvasHandle } from "./ConstellationCanvas";

const ConstellationCanvas = dynamic(() => import("./ConstellationCanvas").then((m) => m.ConstellationCanvas), {
  ssr: false,
  loading: () => <CanvasLoading />,
});

function CanvasLoading() {
  return <div className="grid size-full place-items-center text-xs text-muted" role="status">Drawing your graph</div>;
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
  const { userId, confId } = useSession();
  const params = useSearchParams();
  const router = useRouter();
  const all = params.get("all") === "1";
  const conf = params.get("conf") || confId;
  const hlRaw = params.get("hl") ?? "";
  const highlight = useMemo(() => new Set(hlRaw.split(",").map((s) => s.trim()).filter(Boolean)), [hlRaw]);

  const { data, error, loading, reload } = useApi(apiKey("constellation", userId, all ? "all" : conf), () => api.constellation(userId, all ? undefined : conf));
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
    const timed = data.nodes.filter((n) => n.at).sort((a, b) => a.at!.localeCompare(b.at!));
    const rest = data.nodes.filter((n) => !n.at && !base.includes(n));
    const shown = new Set(base.map((n) => n.id));
    setRevealed(new Set(shown));
    const order = [...timed, ...rest];
    const step = (REPLAY_MS - 600) / Math.max(order.length, 1);
    order.forEach((n, i) => {
      timers.current.push(setTimeout(() => { shown.add(n.id); setRevealed(new Set(shown)); }, 400 + i * step));
    });
    timers.current.push(setTimeout(() => setRevealed(null), REPLAY_MS + 400));
  }, [data, stopReplay]);

  const byId = useMemo(() => new Map((data?.nodes ?? []).map((n) => [n.id, n])), [data]);
  const goals = useMemo(() => (data?.coverage ?? []).map((c) => ({ ...c, label: byId.get(c.goalId)?.label ?? c.goalId })), [data, byId]);
  const hlCount = useMemo(() => [...highlight].filter((id) => byId.has(id)).length, [highlight, byId]);

  return (
    <div className="-mx-4 -mt-4 -mb-4 md:-mx-8 md:-mb-10 md:-mt-8">
      <div
        ref={wrapRef}
        className="relative h-[calc(100dvh-var(--topbar-h)-var(--nav-h)-env(safe-area-inset-bottom))] overflow-hidden bg-bg md:h-dvh"
      >
        {error && !data ? (
          <div className="grid size-full place-items-center p-4"><ErrorState what="your graph" detail={error.message} onRetry={reload} /></div>
        ) : loading || !data ? (
          <CanvasLoading />
        ) : data.nodes.length === 0 ? (
          <div className="grid size-full place-items-center p-4">
            <EmptyState title="Nothing here yet" text="Set goals and build a plan; your sessions, people and notes connect here." action={<Link href="/goals" className={buttonClass({ size: "sm" })}>Set goals</Link>} />
          </div>
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
            onNodeClick={setSelected}
          />
        )}

        {/* Coverage (top-left) */}
        {goals.length > 0 && (
          <div className="pointer-events-none absolute left-3 top-3 flex max-w-[46%] flex-col gap-1.5 md:max-w-xs">
            {goals.map((g) => {
              const pct = g.planned ? Math.min(1, g.covered / g.planned) : 0;
              return (
                <div key={g.goalId} className="pointer-events-auto rounded-md border border-border bg-surface/90 px-2 py-1.5">
                  <div className="flex items-center gap-2 text-[11px] leading-4">
                    <span className="min-w-0 flex-1 truncate text-text" title={g.label}>{g.label}</span>
                    <span className="tabular shrink-0 text-muted">{g.covered}/{g.planned}</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface2">
                    <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: TYPE_COLOR.goal }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Controls (top-right) */}
        <div className="absolute right-3 top-3 flex flex-col items-end gap-2 md:flex-row md:items-center">
          <Segmented
            value={all ? "all" : "conf"}
            onChange={(v) => setParam("all", v === "all" ? "1" : null)}
            options={[{ value: "conf", label: <><span className="md:hidden">Conf</span><span className="hidden md:inline">This conference</span></> }, { value: "all", label: "All" }]}
            className="h-8 text-xs [&_button]:px-2 [&_button]:text-xs md:[&_button]:px-3"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={revealed ? stopReplay : replay}
              disabled={!data}
              className={buttonClass({ variant: "secondary", size: "sm", className: "px-2 md:px-3" })}
              aria-label={revealed ? "Stop replay" : "Replay day"}
              title="Replay day"
            >
              {revealed ? <Square className="size-3.5" /> : <Play className="size-3.5" />}
              <span className="hidden md:inline">{revealed ? "Stop" : "Replay day"}</span>
            </button>
            <button
              type="button"
              onClick={() => canvas.current?.zoomToFit()}
              className={buttonClass({ variant: "secondary", size: "sm", className: "px-2 md:px-3" })}
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
          <div className="absolute bottom-12 left-1/2 z-10 -translate-x-1/2 md:bottom-auto md:top-3">
            <div className="flex items-center gap-2 whitespace-nowrap rounded-full border border-accent/40 bg-surface px-3 py-1.5 text-xs shadow-xl">
              <span className="size-1.5 rounded-full bg-accent" aria-hidden />
              <span className="text-text">Showing: why path</span>
              {hlCount === 0 && <span className="text-faint">· not in this view</span>}
              <button type="button" onClick={() => setParam("hl", null)} className="flex items-center gap-1 text-muted hover:text-text">
                · Clear <X className="size-3" />
              </button>
            </div>
          </div>
        )}

        {/* Legend (bottom-left) */}
        <div className="pointer-events-none absolute bottom-3 left-3 flex max-w-[calc(100%-24px)] flex-wrap gap-x-3 gap-y-1 rounded-md border border-border bg-surface/90 px-2 py-1.5 text-[11px] text-muted">
          {LEGEND.map((l) => (
            <span key={l.type} className="flex items-center gap-1.5">
              <TypeDot type={l.type} size={7} />{l.label}
            </span>
          ))}
          <span className="flex items-center gap-1.5"><span className="inline-block size-[7px] rounded-full border border-muted" />Planned</span>
        </div>
      </div>

      <NodeDrawer node={selected} links={data?.links ?? []} byId={byId} onClose={() => setSelected(null)} />
    </div>
  );
}

function NodeDrawer({ node, links, byId, onClose }: { node: SkyNode | null; links: { source: string; target: string; type: string }[]; byId: Map<string, SkyNode>; onClose(): void }) {
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
      if (at && byId.get(at)?.type === "session") { href = `/sessions/${encodeURIComponent(at)}`; cta = `Open ${byId.get(at)!.label}`; }
    }
  }

  return (
    <Drawer open={!!node} onOpenChange={(o) => !o && onClose()} title={n?.label ?? ""} description={n ? TYPE_LABEL[n.type] : undefined}>
      {n && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="inline-flex h-6 items-center gap-1.5 rounded-md border border-border px-2"><TypeDot type={n.type} />{TYPE_LABEL[n.type]}</span>
            <span className="inline-flex h-6 items-center rounded-md border border-border px-2">{STATE_LABEL[n.state]}</span>
            {n.conferenceId && <span className="inline-flex h-6 items-center rounded-md border border-border px-2">{n.conferenceId}</span>}
            {typeof n.fit === "number" && <span className="tabular inline-flex h-6 items-center rounded-md border border-border px-2">fit {Math.round(n.fit * 100)}%</span>}
          </div>
          {neighbours.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">Connected to</div>
              <ul className="flex flex-col gap-1">
                {neighbours.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 text-sm text-text"><TypeDot type={m.type} /><span className="truncate">{m.label}</span></li>
                ))}
              </ul>
            </div>
          )}
          {href && (
            <Link href={href} className={cn(buttonClass({ size: "md" }), "w-full")} onClick={onClose}>
              {cta}<ArrowRight className="size-4" />
            </Link>
          )}
        </div>
      )}
    </Drawer>
  );
}
