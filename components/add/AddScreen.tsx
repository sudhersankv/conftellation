"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ChevronRight, Circle, Link2, Loader2, RotateCcw, Target } from "lucide-react";
import type { AddConferenceResponse } from "@/lib/types";
import { api } from "@/lib/client";
import { useApi, apiKey } from "@/lib/ui/use-api";
import { useSession } from "@/lib/ui/session-context";
import { Button, Card, Chip, CollectedAgo, Input, PageHeader, SectionHeader, Skeleton, StatusLine } from "@/components/ui";
import { TYPE_COLOR } from "@/lib/ui/tokens";
import { cn } from "@/lib/ui/cn";
import { DEMO_CONFS, fmtConfDates } from "@/components/record/conf-format";

const STEPS = ["Reading the page", "Finding sessions and speakers", "Finding sponsors and booths", "Writing the graph"];
const STEP_MS = [2500, 9000, 9000]; // advance on a timer; the last step waits for the response

const EXAMPLES = [
  { label: "KubeCon NA", url: "https://events.linuxfoundation.org/kubecon-cloudnativecon-north-america/program/schedule/" },
  { label: "Patch the Conference", url: "https://www.wemakedevs.org/hackathons/ptc" },
  { label: "GitHub Universe", url: "https://reg.githubuniverse.com/flow/github/universe26/attendee-portal/page/sessioncatalog" },
];

type Phase = { k: "idle" } | { k: "loading"; step: number } | { k: "done"; res: AddConferenceResponse } | { k: "error"; message: string };

function Progress({ step }: { step: number }) {
  return (
    <Card className="animate-fadeIn">
      <StatusLine className="mb-3">Scout is pulling the agenda. Big programs take up to a minute.</StatusLine>
      <ol className="flex flex-col gap-2.5" aria-live="polite">
        {STEPS.map((s, i) => {
          const state = i < step ? "done" : i === step ? "active" : "todo";
          return (
            <li key={s} className={cn("flex items-center gap-2.5 text-sm", state === "todo" ? "text-faint" : state === "active" ? "text-text" : "text-muted")}>
              {state === "done" ? <Check className="size-4 text-[#0B7A52]" aria-hidden /> : state === "active" ? <Loader2 className="size-4 animate-spin text-text motion-reduce:animate-none" aria-hidden /> : <Circle className="size-4" aria-hidden />}
              {s}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function Count({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg px-3 py-2.5">
      <div className="text-xl font-semibold tabular-nums tracking-tight">{n.toLocaleString("en-US")}</div>
      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted"><span className="size-1.5 rounded-full" style={{ background: color }} aria-hidden />{label}</div>
    </div>
  );
}

function Result({ res, onGoals, onPlan, onReset }: { res: AddConferenceResponse; onGoals(): void; onPlan(): void; onReset(): void }) {
  const c = res.conference;
  return (
    <Card className="animate-fadeIn">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">{c.name}</h2>
          <p className="mt-0.5 text-sm text-muted">{[fmtConfDates(c), c.city].filter(Boolean).join(" · ")}</p>
        </div>
        {res.cached && <Chip kind="status" className="shrink-0">Cached</Chip>}
      </div>
      <StatusLine className="mt-3">
        {res.cached ? "Scout had this one already. " : "Scout "}
        {res.cached ? "" : `found ${res.counts.sessions.toLocaleString("en-US")} sessions. `}
        <CollectedAgo at={c.collectedAt ?? new Date().toISOString()} source={c.source ?? c.url} className="align-middle" />
      </StatusLine>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Count n={res.counts.sessions} label="Sessions" color={TYPE_COLOR.session} />
        <Count n={res.counts.people} label="People" color={TYPE_COLOR.person} />
        <Count n={res.counts.companies} label="Companies" color={TYPE_COLOR.company} />
        <Count n={res.counts.booths} label="Booths" color={TYPE_COLOR.booth} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={onGoals}><Target className="size-4" />Set goals</Button>
        <Button variant="secondary" onClick={onPlan}>Open plan<ArrowRight className="size-4" /></Button>
        <Button variant="ghost" onClick={onReset} className="ml-auto">Add another</Button>
      </div>
    </Card>
  );
}

export function AddScreen() {
  const router = useRouter();
  const { userId, setConfId } = useSession();
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>({ k: "idle" });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const rec = useApi(apiKey("record", userId), () => api.record(userId));

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => clearTimers, []);

  const valid = /^https?:\/\/\S+\.\S+/i.test(url.trim());

  async function pull() {
    if (!valid || phase.k === "loading") return;
    clearTimers();
    setPhase({ k: "loading", step: 0 });
    let t = 0;
    STEP_MS.forEach((ms, i) => { t += ms; timers.current.push(setTimeout(() => setPhase((p) => (p.k === "loading" ? { k: "loading", step: i + 1 } : p)), t)); });
    try {
      const res = await api.addConference(url.trim());
      clearTimers();
      setPhase({ k: "done", res });
      void rec.reload();
    } catch (e) {
      clearTimers();
      setPhase({ k: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  const go = (id: string, href: string) => { setConfId(id); router.push(href); };
  const reset = () => { setPhase({ k: "idle" }); setUrl(""); inputRef.current?.focus(); };

  // "Already imported": the user's record conferences plus the demo conferences, de-duplicated.
  const imported = new Map<string, { id: string; name: string; meta?: string }>();
  for (const r of rec.data?.conferences ?? []) imported.set(r.conference.id, { id: r.conference.id, name: r.conference.name, meta: [fmtConfDates(r.conference), r.conference.city].filter(Boolean).join(" · ") });
  for (const d of DEMO_CONFS) if (!imported.has(d.id)) imported.set(d.id, d);

  const loading = phase.k === "loading";

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Add a conference" subtitle="Paste the agenda or schedule page. Scout reads it into sessions, speakers and booths." />

      <form onSubmit={(e) => { e.preventDefault(); void pull(); }} className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <Input
            ref={inputRef}
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://…/schedule"
            aria-label="Agenda URL"
            value={url}
            disabled={loading}
            onChange={(e) => { setUrl(e.target.value); if (phase.k === "error") setPhase({ k: "idle" }); }}
            className="h-11 pl-9"
          />
        </div>
        <Button type="submit" size="lg" className="h-11" disabled={!valid} loading={loading}>Pull agenda</Button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-faint">Try</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex.url}
            type="button"
            disabled={loading}
            onClick={() => { setUrl(ex.url); if (phase.k !== "loading") setPhase({ k: "idle" }); }}
            title={ex.url}
            className={cn(
              "inline-flex h-10 items-center rounded-md border border-border bg-surface px-3 text-xs text-muted transition duration-fast hover:border-borderStrong hover:text-text disabled:opacity-40 sm:h-8",
              url === ex.url && "border-accent/50 text-text",
            )}
          >
            {ex.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {phase.k === "loading" && <Progress step={phase.step} />}
        {phase.k === "done" && (
          <Result
            res={phase.res}
            onGoals={() => go(phase.res.conference.id, "/goals")}
            onPlan={() => go(phase.res.conference.id, "/plan")}
            onReset={reset}
          />
        )}
        {phase.k === "error" && (
          <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-danger/30 bg-danger/5 p-4">
            <div>
              <p className="text-sm font-medium text-text">Scout couldn&apos;t import that link.</p>
              <p className="mt-1 break-words text-sm text-muted">{phase.message}</p>
            </div>
            <Button variant="secondary" size="sm" className="h-10 md:h-8" onClick={() => void pull()}><RotateCcw className="size-3.5" />Try again</Button>
          </div>
        )}
      </div>

      <section className="mt-10">
        <SectionHeader title="Already imported" />
        {!rec.data && !rec.error ? (
          <Skeleton rows={2} rowClassName="h-12" />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {[...imported.values()].map((c) => (
              <li key={c.id}>
                <Link
                  href="/plan"
                  onClick={() => setConfId(c.id)}
                  className="flex min-h-12 items-center gap-3 px-4 py-2.5 text-sm transition duration-fast hover:bg-surface2"
                >
                  <span className="size-1.5 shrink-0 rounded-full" style={{ background: TYPE_COLOR.conference }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-text">{c.name}</span>
                    {c.meta && <span className="block truncate text-xs text-muted">{c.meta}</span>}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
