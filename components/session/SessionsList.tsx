"use client";
// /sessions: "My sessions" for the current conference, from the plan itinerary, grouped by day. Booths below, compact.
import Link from "next/link";
import { useMemo } from "react";
import { ChevronRight, Target } from "lucide-react";
import type { ConferenceDetail, Goal, ItinerarySlot } from "@/lib/types";
import { api } from "@/lib/client";
import { apiKey, useApi } from "@/lib/ui/use-api";
import { useSession } from "@/lib/ui/session-context";
import { fmtDay, fmtRange, TZ } from "@/lib/ui/format";
import { TYPE_COLOR } from "@/lib/ui/tokens";
import { cn } from "@/lib/ui/cn";
import { buttonClass, Chip, EmptyState, ErrorState, PageHeader, SectionHeader, Skeleton } from "@/components/ui";

type Status = "Done" | "Now" | "Planned";

function statusOf(s: ItinerarySlot, nowMs: number): Status {
  if (s.item.status === "done") return "Done";
  if (Date.parse(s.from) <= nowMs && nowMs < Date.parse(s.to)) return "Now";
  return "Planned";
}

const STATUS_CLS: Record<Status, string> = {
  Done: "bg-surface2 text-muted",
  Now: "bg-accent text-text",
  Planned: "bg-surface text-text",
};

function groupByDay(slots: ItinerarySlot[], tz: string) {
  const out: { day: string; slots: ItinerarySlot[] }[] = [];
  for (const s of slots) {
    const d = fmtDay(s.from, tz);
    const last = out[out.length - 1];
    if (last && last.day === d) last.slots.push(s);
    else out.push({ day: d, slots: [s] });
  }
  return out;
}

export function SessionsList() {
  const { userId, confId, now, nowIso } = useSession();
  const iso = nowIso();
  const planQ = useApi(apiKey("plan", userId, confId, iso), () => api.plan(userId, confId, { now: iso }));
  const confQ = useApi<ConferenceDetail>(apiKey("conference", confId), () => api.conference(confId));
  const conf = confQ.data?.conference;
  const tz = conf?.timezone || TZ;
  const plan = planQ.data;
  const nowMs = now().getTime();

  const goals = useMemo(() => new Map<string, Goal>((plan?.byGoal ?? []).map((g) => [g.goal.id, g.goal])), [plan]);
  const visible = useMemo(
    () => (plan?.itinerary ?? []).filter((s) => s.item.status !== "skipped").sort((a, b) => a.from.localeCompare(b.from)),
    [plan],
  );
  const sessions = visible.filter((s) => s.item.type === "session");
  const booths = visible.filter((s) => s.item.type === "booth");

  if (planQ.error && !plan) {
    const msg = planQ.error.message;
    if (/404|not onboarded|no goals|not found/i.test(msg)) return <NoPlan name={conf?.name} />;
    return <ErrorState what="your sessions" detail={msg} onRetry={() => { void planQ.reload(); void confQ.reload(); }} />;
  }
  if (!plan) return <div className="flex flex-col gap-3"><Skeleton rows={1} rowClassName="h-20" /><Skeleton rows={5} rowClassName="h-20" /></div>;
  if (sessions.length === 0 && booths.length === 0) return <NoPlan name={conf?.name} />;

  const done = sessions.filter((s) => s.item.status === "done").length;
  const goalOf = (s: ItinerarySlot) => (s.item.goalId ? goals.get(s.item.goalId) : undefined);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        className="mb-0"
        eyebrow={conf?.name ?? confId}
        title="My sessions"
        subtitle={<span className="tabular">{sessions.length} session{sessions.length === 1 ? "" : "s"} · {done} done · {sessions.length - done} to go</span>}
        actions={<Link href="/plan" className={buttonClass({ variant: "secondary", size: "sm" })}>Open plan</Link>}
      />

      {sessions.length === 0 ? (
        <EmptyState text="No sessions in your plan yet." action={<Link href="/plan" className={buttonClass()}>Open plan</Link>} />
      ) : groupByDay(sessions, tz).map((g) => (
        <section key={g.day}>
          <SectionHeader title={g.day} count={g.slots.length} />
          <ul className="flex flex-col gap-3">
            {g.slots.map((s) => <Row key={`${s.item.id}-${s.from}`} slot={s} tz={tz} goal={goalOf(s)} status={statusOf(s, nowMs)} />)}
          </ul>
        </section>
      ))}

      {booths.length > 0 && (
        <section>
          <SectionHeader title="Booths" count={booths.length} />
          <ul className="grid gap-2 md:grid-cols-2">
            {booths.map((s) => <Row key={`${s.item.id}-${s.from}`} slot={s} tz={tz} goal={goalOf(s)} status={statusOf(s, nowMs)} compact />)}
          </ul>
        </section>
      )}
    </div>
  );
}

function Row({ slot, tz, goal, status, compact }: { slot: ItinerarySlot; tz: string; goal?: Goal; status: Status; compact?: boolean }) {
  const it = slot.item;
  const isSession = it.type === "session";
  const room = isSession ? it.session?.room ?? it.subtitle : it.booth?.label ?? it.subtitle;
  const body = (
    <>
      <span className="pointer-events-none absolute inset-y-0 left-0 w-[6px] border-r-2 border-border" style={{ background: isSession ? TYPE_COLOR.session : TYPE_COLOR.booth }} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip kind="time">{fmtRange(slot.from, slot.to, tz)}</Chip>
          {room && <Chip kind={isSession ? "room" : "booth"}>{room}</Chip>}
          <Chip kind="status" className={cn("font-bold", STATUS_CLS[status])}>{status}</Chip>
        </div>
        <p className={cn("mt-2 font-heading font-bold leading-5 tracking-tight", compact ? "truncate text-sm" : "text-[15px]", status === "Done" ? "text-muted" : "text-text")}>{it.title}</p>
        {goal && (
          <p className="mt-1.5 flex min-w-0 items-center gap-1.5 text-xs text-muted">
            <span className="size-2 shrink-0 rounded-full ring-1 ring-ink" style={{ background: TYPE_COLOR.goal }} aria-hidden />
            <span className="truncate">{goal.text}</span>
          </p>
        )}
      </div>
      {isSession && <ChevronRight className="size-4 shrink-0 self-center text-muted" aria-hidden />}
    </>
  );
  const cls = cn(
    "relative flex gap-3 overflow-hidden rounded-xl border-2 border-border bg-surface",
    compact ? "p-3 shadow-hardSm" : "p-4 shadow-hard",
    "pl-[22px]",
    status === "Now" && "ring-[3px] ring-accent",
  );
  return (
    <li>
      {isSession
        ? <Link href={`/sessions/${encodeURIComponent(it.id)}`} className={cn(cls, "press")}>{body}</Link>
        : <div className={cls}>{body}</div>}
    </li>
  );
}

function NoPlan({ name }: { name?: string }) {
  return (
    <EmptyState
      icon={<Target className="size-6" />}
      title="No plan yet"
      text={`Set your goals for ${name ?? "this conference"} and the Planner picks your sessions.`}
      action={<Link href="/goals" className={buttonClass()}>Set goals</Link>}
    />
  );
}
