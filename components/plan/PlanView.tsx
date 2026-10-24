"use client";
// /plan: the calendar. Header + summary, day tabs, steer bar + proposal, hour grid (md+) / time list (phone), By goal view.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, Lock, LockOpen, PenLine, Target } from "lucide-react";
import { toast } from "sonner";
import type { ConferenceDetail, Goal, ItinerarySlot, PlanResponse, SteerResponse } from "@/lib/types";
import { api } from "@/lib/client";
import { apiKey, useApi } from "@/lib/ui/use-api";
import { useSession } from "@/lib/ui/session-context";
import { TZ } from "@/lib/ui/format";
import { TYPE_COLOR } from "@/lib/ui/tokens";
import { cn } from "@/lib/ui/cn";
import { Button, buttonClass, Chip, EmptyState, ErrorState, Segmented, Skeleton } from "@/components/ui";
import { DayGrid, DayList } from "./DayCalendar";
import { ItemDrawer } from "./ItemDrawer";
import { ByGoalView } from "./ByGoalView";
import { ProposalPanel, SteerBar } from "./Steer";
import { dateRangeLabel, dayKey, dayLabel, dayRange, dayShort, minuteOfDay } from "./time";

type View = "day" | "goal";

function useFinal(userId: string, confId: string) {
  const k = `plan:final:${userId}:${confId}`;
  const [final, setFinal] = useState(false);
  useEffect(() => { try { setFinal(localStorage.getItem(k) === "1"); } catch { setFinal(false); } }, [k]);
  const set = (v: boolean) => { setFinal(v); try { if (v) localStorage.setItem(k, "1"); else localStorage.removeItem(k); } catch { /* storage blocked */ } };
  return [final, set] as const;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function PlanView() {
  const { userId, confId, now, nowIso } = useSession();
  const iso = nowIso();
  const planQ = useApi(apiKey("plan", userId, confId, iso), () => api.plan(userId, confId, { now: iso }));
  const confQ = useApi<ConferenceDetail>(apiKey("conference", confId), () => api.conference(confId));
  const [view, setView] = useState<View>("day");
  const [day, setDay] = useState<string | null>(null);
  const [open, setOpen] = useState<ItinerarySlot | null>(null);
  const [proposal, setProposal] = useState<SteerResponse | null>(null);
  const [final, setFinal] = useFinal(userId, confId);

  const conf = confQ.data?.conference;
  const tz = conf?.timezone || TZ;
  const plan = planQ.data;
  const days = useMemo(() => {
    if (conf) return dayRange(conf.startDate, conf.endDate);
    const ks = Array.from(new Set((plan?.itinerary ?? []).map((s) => dayKey(s.from, tz)))).sort();
    return ks.length ? ks : [dayKey(now(), tz)];
  }, [conf, plan, tz, now]);
  const visible = useMemo(() => (plan?.itinerary ?? []).filter((s) => s.item.status !== "skipped"), [plan]);
  const today = dayKey(now(), tz);

  // Default day: today if in range, else first day with slots, else day 1.
  useEffect(() => {
    if (day && days.includes(day)) return;
    if (days.includes(today)) return setDay(today);
    const withSlots = days.find((d) => visible.some((s) => dayKey(s.from, tz) === d));
    setDay(withSlots ?? days[0]);
  }, [days, today, visible, tz, day]);

  const goals = useMemo(() => new Map<string, Goal>((plan?.byGoal ?? []).map((g) => [g.goal.id, g.goal])), [plan]);

  if (planQ.error && !plan) {
    const msg = planQ.error.message;
    if (/404|not onboarded|no goals|not found/i.test(msg)) return <NoPlan name={conf?.name} />;
    return <ErrorState what="your plan" detail={msg} onRetry={() => { void planQ.reload(); void confQ.reload(); }} />;
  }
  if (!plan) return <PlanSkeleton />;
  if (plan.itinerary.length === 0 && plan.byGoal.length === 0) return <NoPlan name={conf?.name} />;

  const counts = { session: 0, booth: 0, meet: 0, person: 0 };
  for (const s of visible) if (s.item.type in counts) counts[s.item.type as keyof typeof counts]++;
  const goalCounts = plan.byGoal.map((g) => ({
    goal: g.goal,
    n: [...g.sessions, ...g.people, ...g.booths].filter((i) => i.status !== "skipped").length,
  }));
  const daySlots = visible.filter((s) => dayKey(s.from, tz) === day);
  const nowMin = day === today ? minuteOfDay(now(), tz) : null;
  const mutate = (p: PlanResponse) => planQ.mutate(p);

  const summary = [
    days.length > 1 && plural(days.length, "day"),
    plural(counts.session, "session"),
    plural(counts.booth, "booth"),
    plural(counts.meet, "meet"),
    counts.person > 0 && plural(counts.person, "person"),
  ].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 rounded-full border-2 border-border bg-accent px-2.5 py-0.5 font-heading text-[11px] font-bold uppercase tracking-wide text-ink">
            <CalendarDays className="size-3.5" aria-hidden />Your plan
          </div>
          <h1 className="mt-2 font-heading text-[28px] font-bold leading-[1.05] tracking-tight md:text-4xl">{conf?.name ?? confId}</h1>
          <p className="tabular mt-1 text-sm text-muted">
            {conf ? `${dateRangeLabel(conf.startDate, conf.endDate)}${conf.city ? ` · ${conf.city}` : ""}` : " "}
            <span className="text-faint"> · </span>
            <span className="text-text">{summary}</span>
          </p>
          {goalCounts.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {goalCounts.map(({ goal, n }) => (
                <Chip key={goal.id} kind="goal" dot={TYPE_COLOR.goal} className="max-w-full"><span className="truncate">{goal.text}</span><span className="tabular text-muted">{n}</span></Chip>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {plan.now && (
            <Link href={`/sessions/${encodeURIComponent(plan.now.targetId)}`} className={buttonClass({ variant: "primary", className: "h-10" })} title={`Capture now: ${plan.now.title}`}>
              <PenLine className="size-4" aria-hidden />Capture now
            </Link>
          )}
          <Segmented<View> value={view} onChange={setView} options={[{ value: "day", label: "Day" }, { value: "goal", label: "By goal" }]} className="h-10" />
          {final ? (
            <div className="flex h-10 items-center gap-1 rounded-full border-2 border-border bg-surface pl-3 pr-1 text-sm font-heading font-bold shadow-hardSm">
              <Lock className="size-3.5 text-[#0B7A52]" aria-hidden /><span className="text-text">Plan locked</span>
              <Button variant="ghost" size="sm" className="ml-1" onClick={() => { setFinal(false); toast("Plan unlocked"); }}><LockOpen className="size-3.5" aria-hidden />Edit</Button>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => { setFinal(true); setProposal(null); toast("Plan finalized", { description: "Steering and feedback are hidden. Tap Edit to change it." }); }}>
              <Lock className="size-4" aria-hidden />Finalize
            </Button>
          )}
        </div>
      </header>

      {/* Day tabs */}
      {view === "day" && days.length > 1 && (
        <div role="tablist" aria-label="Days" className="scrollbar-thin -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
          {days.map((d) => {
            const n = visible.filter((s) => dayKey(s.from, tz) === d).length;
            const sel = d === day;
            return (
              <button key={d} role="tab" type="button" aria-selected={sel} onClick={() => setDay(d)}
                className={cn("relative flex h-10 shrink-0 items-center gap-2 rounded-full border-2 border-border px-4 font-heading text-sm font-bold transition duration-fast", sel ? "bg-ink text-cream" : "bg-surface text-text hover:bg-accent/40")}>
                <span className="md:hidden">{dayShort(d)}</span><span className="hidden md:inline">{dayLabel(d)}</span>
                {d === today && <span className="size-2 rounded-full bg-pink ring-1 ring-ink" aria-label="Today" />}
                <span className={cn("tabular text-xs", sel ? "text-cream/70" : "text-muted")}>{n}</span>
                
              </button>
            );
          })}
        </div>
      )}

      {/* Steer + proposal (sticky under the top bar on phones, top of page on md+) */}
      {!final && (
        <div className="sticky top-[var(--topbar-h)] z-20 -mx-4 border-b-2 border-border bg-bg px-4 py-3 md:top-2 md:mx-0 md:rounded-full md:border-2 md:bg-surface md:py-2 md:pl-2 md:pr-2 md:shadow-hard">
          <SteerBar onPlan={mutate} onProposal={setProposal} />
        </div>
      )}
      {proposal && !final && <ProposalPanel res={proposal} tz={tz} onPlan={mutate} onClose={() => setProposal(null)} />}

      {view === "day" ? (
        <>
          {days.length === 1 && day && <div className="-mb-1 flex items-baseline gap-2 font-heading text-sm font-bold text-text">{dayLabel(day)}{day === today && <span className="rounded-full border-2 border-border bg-pink px-2 text-[11px] uppercase leading-5 text-ink">Today</span>}</div>}
          {daySlots.length === 0 ? (
            <EmptyState title={`Nothing planned on ${day ? dayLabel(day) : "this day"}`} text={days.length > 1 ? "Pick another day, or steer to add sessions here." : "Steer to add sessions, e.g. “more tracing”."} />
          ) : (
            <>
              <div className="hidden md:block"><DayGrid slots={daySlots} tz={tz} goals={goals} nowMin={nowMin} onOpen={setOpen} /></div>
              <div className="md:hidden"><DayList slots={daySlots} tz={tz} goals={goals} nowMin={nowMin} onOpen={setOpen} /></div>
            </>
          )}
          <Legend />
        </>
      ) : (
        <ByGoalView plan={plan} tz={tz} confId={confId} locked={final} onPlan={mutate} onOpen={setOpen} />
      )}

      <ItemDrawer slot={open} onClose={() => setOpen(null)} tz={tz} goals={goals} confId={confId} locked={final} onPlan={mutate} />
    </div>
  );
}

function Legend() {
  const items: [string, string][] = [["Session", TYPE_COLOR.session], ["Booth", TYPE_COLOR.booth], ["Person", TYPE_COLOR.person], ["Meet", TYPE_COLOR.meet]];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      {items.map(([l, c]) => <span key={l} className="flex items-center gap-1.5"><span className="h-3 w-[3px] rounded-full" style={{ background: c }} />{l}</span>)}
      <span className="flex items-center gap-1.5"><span className="hatched size-3 rounded-sm border border-border" />Blocked</span>
      <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm border border-border bg-surface2" />Done</span>
      <span className="flex items-center gap-1.5"><span className="h-px w-3 bg-danger" />Now</span>
    </div>
  );
}

function NoPlan({ name }: { name?: string }) {
  return (
    <EmptyState
      icon={<Target className="size-6" />}
      title={`No plan yet for ${name ?? "this conference"}`}
      text="Tell us what you came for and the Planner builds your day: sessions, booths and people, each with a reason."
      action={<Link href="/goals" className={buttonClass()}>Set goals</Link>}
    />
  );
}

function PlanSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="h-7 w-64 animate-pulse rounded-md bg-surface2" />
      <div className="h-4 w-80 max-w-full animate-pulse rounded-md bg-surface2" />
      <div className="h-12 animate-pulse rounded-lg bg-surface2" />
      <Skeleton rows={6} rowClassName="h-16" />
    </div>
  );
}
