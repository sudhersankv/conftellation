"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Goal, ItinerarySlot, PlanResponse } from "@/lib/types";
import { fmtDay, fmtRange } from "@/lib/ui/format";
import { TYPE_COLOR } from "@/lib/ui/tokens";
import { buttonClass, Chip, CollectedAgo, Drawer, SectionHeader, WhyList } from "@/components/ui";
import { FeedbackButtons } from "./FeedbackButtons";
import { typeColor } from "./time";

const KIND = { session: "Session", booth: "Booth", person: "Person", meet: "Meet", block: "Blocked time" } as const;

export function itemHref(slot: { item: ItinerarySlot["item"] }): { href: string; label: string } | null {
  const { item } = slot;
  if (item.type === "session") return { href: `/sessions/${encodeURIComponent(item.session?.id ?? item.id)}`, label: "Open session" };
  if (item.type === "person") return { href: `/people/${encodeURIComponent(item.person?.id ?? item.id)}`, label: "Open person" };
  if (item.type === "meet") return item.person ? { href: `/people/${encodeURIComponent(item.person.id)}`, label: "Open person" } : { href: "/network", label: "Open network" };
  return null;
}

export function ItemDrawer({ slot, onClose, tz, goals, confId, locked, onPlan }: {
  slot: ItinerarySlot | null; onClose(): void; tz: string; goals: Map<string, Goal>; confId: string; locked: boolean; onPlan(p: PlanResponse): void;
}) {
  const item = slot?.item;
  const goal = item?.goalId ? goals.get(item.goalId) : undefined;
  const link = slot ? itemHref(slot) : null;
  const speakers = item?.session?.speakers ?? [];
  return (
    <Drawer open={!!slot} onOpenChange={(o) => !o && onClose()} title={item?.title ?? ""} description={item ? KIND[item.type] : undefined}>
      {slot && item && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip kind="time" dot={typeColor(item.type)}>{fmtDay(slot.from, tz)} · {fmtRange(slot.from, slot.to, tz)}</Chip>
            {item.subtitle && <Chip kind={item.type === "booth" ? "booth" : "room"}>{item.subtitle}</Chip>}
            {item.status === "done" && <Chip kind="status">Done</Chip>}
            {goal && <Chip kind="goal" dot={TYPE_COLOR.goal} className="max-w-full"><span className="truncate">{goal.text}</span></Chip>}
          </div>

          {item.type === "booth" && item.booth?.company.description && <p className="text-sm leading-6 text-muted">{item.booth.company.description}</p>}
          {item.type === "person" && item.person && (
            <p className="text-sm text-muted">{[item.person.title, item.person.company].filter(Boolean).join(" · ")}</p>
          )}
          {item.session?.abstract && <p className="line-clamp-4 text-sm leading-6 text-muted">{item.session.abstract}</p>}

          {speakers.length > 0 && (
            <section>
              <SectionHeader title="Speakers" count={speakers.length} className="mb-2" />
              <ul className="flex flex-col gap-1">
                {speakers.map((s) => (
                  <li key={s.id}>
                    <Link href={`/people/${encodeURIComponent(s.id)}`} className="flex min-h-10 items-center justify-between gap-3 rounded-md px-2 text-sm hover:bg-surface2">
                      <span className="min-w-0 truncate"><span className="text-text">{s.name}</span>{(s.title || s.company) && <span className="text-muted"> · {[s.title, s.company].filter(Boolean).join(", ")}</span>}</span>
                      <ArrowUpRight className="size-3.5 shrink-0 text-faint" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {item.why.length > 0 && (
            <section>
              <SectionHeader title="Why it's in your plan" className="mb-2" />
              <WhyList paths={item.why} confId={confId} />
            </section>
          )}

          {(item.type === "session" || item.type === "booth") && <CollectedAgo at={item.collectedAt} source={item.source} />}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            {!locked && item.type !== "block" && item.type !== "meet" ? <FeedbackButtons item={item} onPlan={(p) => { onPlan(p); onClose(); }} size="md" /> : <span />}
            {link && <Link href={link.href} className={buttonClass({ variant: "primary", size: "md" })}>{link.label}<ArrowUpRight className="size-4" aria-hidden /></Link>}
          </div>
        </div>
      )}
    </Drawer>
  );
}
