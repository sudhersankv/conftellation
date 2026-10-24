"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { GoalPlan, ItinerarySlot, PlanItem, PlanResponse } from "@/lib/types";
import { fmtRange } from "@/lib/ui/format";
import { TYPE_COLOR } from "@/lib/ui/tokens";
import { buttonClass, Card, Chip, CollectedAgo, EmptyState, SectionHeader, WhyLine } from "@/components/ui";
import { FeedbackButtons } from "./FeedbackButtons";

export function ByGoalView({ plan, tz, confId, locked, onPlan, onOpen }: {
  plan: PlanResponse; tz: string; confId: string; locked: boolean; onPlan(p: PlanResponse): void; onOpen(slot: ItinerarySlot): void;
}) {
  if (plan.byGoal.length === 0) return <EmptyState title="No goals yet" text="Add a goal to see your plan grouped by what you came for." action={<Link href="/goals" className={buttonClass()}>Set goals</Link>} />;
  const slotOf = new Map(plan.itinerary.map((s) => [s.item.id, s]));
  return (
    <div className="flex flex-col gap-8">
      {plan.byGoal.map((g) => <GoalSection key={g.goal.id} g={g} tz={tz} confId={confId} locked={locked} onPlan={onPlan} slotOf={slotOf} onOpen={onOpen} />)}
    </div>
  );
}

function GoalSection({ g, tz, confId, locked, onPlan, slotOf, onOpen }: {
  g: GoalPlan; tz: string; confId: string; locked: boolean; onPlan(p: PlanResponse): void; slotOf: Map<string, ItinerarySlot>; onOpen(s: ItinerarySlot): void;
}) {
  const sessions = g.sessions.filter((s) => s.status !== "skipped");
  const people = g.people.filter((s) => s.status !== "skipped");
  const booths = g.booths.filter((s) => s.status !== "skipped");
  const fb = (item: PlanItem) => (locked ? null : <FeedbackButtons item={item} onPlan={onPlan} />);
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <span className="size-2 shrink-0 rounded-full" style={{ background: TYPE_COLOR.goal }} aria-hidden />
        <h2 className="min-w-0 text-base font-semibold tracking-tight">{g.goal.text}</h2>
        <Chip kind="goal" className="capitalize">{g.goal.kind}</Chip>
        <span className="ml-auto text-xs text-muted">{sessions.length + people.length + booths.length} items</span>
      </div>

      {sessions.length > 0 && (
        <div className="mb-5">
          <SectionHeader title="Sessions" count={sessions.length} className="mb-2" />
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {sessions.map((it) => {
              const slot = slotOf.get(it.id);
              const from = slot?.from ?? it.session?.start, to = slot?.to ?? it.session?.end;
              return (
                <li key={it.id} className="flex flex-col gap-2 p-3 md:flex-row md:items-start md:gap-4">
                  <div className="tabular w-32 shrink-0 pt-0.5 text-xs text-muted">{from && to ? fmtRange(from, to, tz) : "Unscheduled"}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {slot ? (
                        <button type="button" onClick={() => onOpen(slot)} className="min-w-0 text-left text-sm font-medium text-text hover:underline underline-offset-2">{it.title}</button>
                      ) : (
                        <Link href={`/sessions/${encodeURIComponent(it.id)}`} className="min-w-0 text-sm font-medium text-text hover:underline underline-offset-2">{it.title}</Link>
                      )}
                      {it.subtitle && <Chip kind="room" className="h-5 px-1.5 text-[11px]">{it.subtitle}</Chip>}
                      {it.status === "done" && <Chip kind="status" className="h-5 px-1.5 text-[11px]">Done</Chip>}
                    </div>
                    <WhyLine paths={it.why} confId={confId} compact className="mt-1" />
                    <CollectedAgo at={it.collectedAt} source={it.source} className="mt-1" />
                  </div>
                  {fb(it)}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {people.length > 0 && (
        <div className="mb-5">
          <SectionHeader title="People" count={people.length} className="mb-2" />
          <div className="grid gap-2 sm:grid-cols-2">
            {people.map((it) => (
              <Card key={it.id} accent={TYPE_COLOR.person} className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-text">{it.title}</div>
                    {it.subtitle && <div className="mt-0.5 truncate text-xs text-muted">{it.subtitle}</div>}
                  </div>
                  <Link href={`/people/${encodeURIComponent(it.person?.id ?? it.id)}`} className={buttonClass({ variant: "ghost", size: "sm", className: "h-10 md:h-8" })}>Open<ArrowUpRight className="size-3.5" aria-hidden /></Link>
                </div>
                <WhyLine paths={it.why} confId={confId} compact />
                {fb(it)}
              </Card>
            ))}
          </div>
        </div>
      )}

      {booths.length > 0 && (
        <div>
          <SectionHeader title="Booths" count={booths.length} className="mb-2" />
          <div className="grid gap-2 sm:grid-cols-2">
            {booths.map((it) => (
              <Card key={it.id} accent={TYPE_COLOR.booth} className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 text-sm font-medium text-text">{it.booth?.company.name ?? it.title}</div>
                  {(it.booth?.label ?? it.subtitle) && <Chip kind="booth" className="shrink-0">{it.booth?.label ?? it.subtitle}</Chip>}
                </div>
                {it.booth?.company.description && <p className="line-clamp-2 text-xs leading-5 text-muted">{it.booth.company.description}</p>}
                <WhyLine paths={it.why} confId={confId} compact />
                <CollectedAgo at={it.collectedAt} source={it.source} />
                {fb(it)}
              </Card>
            ))}
          </div>
        </div>
      )}

      {sessions.length + people.length + booths.length === 0 && <p className="text-sm text-muted">Nothing planned for this goal yet. Try steering “more {g.goal.topics[0] ?? "of this"}”.</p>}
    </section>
  );
}
