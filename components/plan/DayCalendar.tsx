"use client";
// Day view: hour grid on md+, vertical time list on phones. Same slots, same block colours.
import { useEffect, useRef } from "react";
import type { Goal, ItinerarySlot } from "@/lib/types";
import { fmtRange, fmtTime } from "@/lib/ui/format";
import { TYPE_COLOR } from "@/lib/ui/tokens";
import { cn } from "@/lib/ui/cn";
import { Chip } from "@/components/ui";
import { hourLabel, layoutLanes, minuteOfDay, typeColor } from "./time";

export const PX_PER_MIN = 1.8;

interface Props {
  slots: ItinerarySlot[]; // this day's visible slots (skipped removed)
  tz: string;
  goals: Map<string, Goal>;
  nowMin: number | null; // minutes-of-day when the day is today
  onOpen(slot: ItinerarySlot): void;
}

const TYPE_NAME = { session: "Session", booth: "Booth", person: "Person", meet: "Meet", block: "Blocked" } as const;

function Block({ slot, tz, goal, h, onOpen, past }: { slot: ItinerarySlot; tz: string; goal?: Goal; h: number; onOpen(): void; past?: boolean }) {
  const { item } = slot;
  const isBlock = item.type === "block";
  const done = item.status === "done";
  const room = item.subtitle;
  const oneLine = h < 44; // title + start time on one row
  const tiny = h < 26;
  const showGoal = h >= 76 && goal && !isBlock;
  const twoLineTitle = h >= 96;
  return (
    <button
      type="button"
      onClick={isBlock ? undefined : onOpen}
      disabled={isBlock}
      title={`${item.title} · ${fmtRange(slot.from, slot.to, tz)}${room ? ` · ${room}` : ""}`}
      aria-label={`${TYPE_NAME[item.type]}: ${item.title}, ${fmtRange(slot.from, slot.to, tz)}`}
      className={cn(
        "group flex h-full w-full min-w-0 flex-col overflow-hidden rounded-[6px] border text-left transition duration-fast",
        isBlock ? "hatched cursor-default border-border bg-bg" : "border-border hover:border-borderStrong",
        !isBlock && (done ? "bg-surface2" : "bg-surface hover:bg-surface2"),
        tiny ? "justify-center px-2" : oneLine ? "justify-center px-2 py-0.5" : "px-2.5 py-1.5",
        past && !done && !isBlock && "opacity-60",
      )}
      style={isBlock ? undefined : { borderLeftWidth: 3, borderLeftColor: typeColor(item.type) }}
    >
      {oneLine ? (
        <div className="flex min-w-0 items-baseline gap-2 text-[11px] leading-4">
          <span className={cn("min-w-0 truncate font-medium", isBlock ? "capitalize text-muted" : "text-text")}>{item.title}</span>
          <span className="tabular shrink-0 text-muted">{fmtTime(slot.from, tz)}</span>
          {room && !isBlock && <span className="ml-auto hidden shrink-0 truncate text-faint lg:inline">{room}</span>}
        </div>
      ) : (
        <>
          <div className={cn("min-w-0 text-xs font-medium leading-[18px]", isBlock ? "capitalize text-muted" : "text-text", twoLineTitle ? "line-clamp-2" : "truncate")}>{item.title}</div>
          <div className="tabular mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] leading-4 text-muted">
            <span className="shrink-0">{fmtRange(slot.from, slot.to, tz)}</span>
            {room && !isBlock && <span className="min-w-0 truncate text-faint">· {room}</span>}
            {goal && !isBlock && !showGoal && (
              <span className="ml-auto flex min-w-0 items-center gap-1.5 pl-2" title={goal.text}>
                <span className="size-1.5 shrink-0 rounded-full" style={{ background: TYPE_COLOR.goal }} aria-hidden />
                <span className="hidden truncate xl:inline">{goal.text}</span>
              </span>
            )}
          </div>
          {showGoal && (
            <div className="mt-auto flex min-w-0 items-center gap-1.5 text-[11px] leading-4 text-muted">
              <span className="size-1.5 shrink-0 rounded-full" style={{ background: TYPE_COLOR.goal }} aria-hidden />
              <span className="truncate">{goal.text}</span>
            </div>
          )}
        </>
      )}
    </button>
  );
}

export function DayGrid({ slots, tz, goals, nowMin, onOpen }: Props) {
  const laid = layoutLanes(slots, tz);
  const first = laid.length ? Math.min(...laid.map((l) => l.start)) : 8 * 60;
  const last = laid.length ? Math.max(...laid.map((l) => l.end)) : 18 * 60;
  const startH = Math.min(Math.floor(first / 60), 8);
  const endH = Math.min(24, Math.max(Math.ceil(last / 60), 18));
  const top = (m: number) => (m - startH * 60) * PX_PER_MIN;
  const hours = Array.from({ length: endH - startH + 1 }, (_, i) => startH + i);
  const height = (endH - startH) * 60 * PX_PER_MIN;
  // Like Google Calendar: the grid scrolls on its own and opens at "now" (or the first slot), an hour of context above.
  const scroller = useRef<HTMLDivElement>(null);
  const anchor = nowMin !== null && nowMin >= startH * 60 && nowMin <= endH * 60 ? Math.min(nowMin, first) : first;
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = Math.max(0, top(anchor - 45));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, startH]);
  return (
    <div ref={scroller} className="scrollbar-thin relative flex max-h-[max(440px,calc(100dvh-300px))] overflow-y-auto rounded-lg border border-border bg-bg">
      <div className="relative w-14 shrink-0 border-r border-border" style={{ height: height + 16 }}>
        {hours.map((h) => (
          <div key={h} className="tabular absolute right-2 -translate-y-1/2 text-[11px] text-faint" style={{ top: top(h * 60) + 8 }}>{hourLabel(h)}</div>
        ))}
      </div>
      <div className="relative min-w-0 flex-1" style={{ height: height + 16 }}>
        {hours.map((h) => (
          <div key={h} className="absolute inset-x-0 border-t border-border/70" style={{ top: top(h * 60) + 8 }} />
        ))}
        {hours.slice(0, -1).map((h) => (
          <div key={`h${h}`} className="absolute inset-x-0 border-t border-dashed border-border/30" style={{ top: top(h * 60 + 30) + 8 }} />
        ))}
        {laid.map(({ slot, start, end, lane, lanes }) => {
          const h = Math.max(14, (end - start) * PX_PER_MIN - 2);
          return (
            <div
              key={`${slot.item.id}-${slot.from}`}
              className="absolute px-1"
              style={{ top: top(start) + 8 + 1, height: h, left: `${(lane / lanes) * 100}%`, width: `${100 / lanes}%` }}
            >
              <Block slot={slot} tz={tz} goal={slot.item.goalId ? goals.get(slot.item.goalId) : undefined} h={h} onOpen={() => onOpen(slot)} past={nowMin !== null && end <= nowMin} />
            </div>
          );
        })}
        {nowMin !== null && nowMin >= startH * 60 && nowMin <= endH * 60 && (
          <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: top(nowMin) + 8 }} aria-label="Now">
            <span className="-ml-1 size-2 rounded-full bg-danger" />
            <span className="h-px flex-1 bg-danger" />
          </div>
        )}
      </div>
    </div>
  );
}

/** Phone: time on the left, card on the right. */
export function DayList({ slots, tz, goals, nowMin, onOpen }: Props) {
  const sorted = [...slots].sort((a, b) => a.from.localeCompare(b.from));
  let nowPlaced = nowMin === null;
  return (
    <ol className="flex flex-col">
      {sorted.map((slot) => {
        const start = minuteOfDay(slot.from, tz);
        const showNow = !nowPlaced && nowMin !== null && start >= nowMin;
        if (showNow) nowPlaced = true;
        const { item } = slot;
        const goal = item.goalId ? goals.get(item.goalId) : undefined;
        const isBlock = item.type === "block";
        return (
          <li key={`${item.id}-${slot.from}`}>
            {showNow && <NowRule />}
            <div className="flex gap-3 py-1.5">
              <div className="tabular w-14 shrink-0 pt-2 text-right text-xs leading-4 text-muted">
                {fmtTime(slot.from, tz)}
              </div>
              <button
                type="button"
                disabled={isBlock}
                onClick={() => onOpen(slot)}
                className={cn(
                  "min-h-[52px] min-w-0 flex-1 rounded-lg border border-border px-3 py-2 text-left transition duration-fast",
                  isBlock ? "hatched cursor-default" : item.status === "done" ? "bg-surface2" : "bg-surface active:bg-surface2",
                )}
                style={isBlock ? undefined : { borderLeft: `3px solid ${typeColor(item.type)}` }}
              >
                <div className={cn("text-sm font-medium leading-5", isBlock ? "capitalize text-muted" : "text-text")}>{item.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="tabular text-xs text-muted">{fmtRange(slot.from, slot.to, tz)}</span>
                  {item.subtitle && !isBlock && <Chip kind={item.type === "booth" ? "booth" : "room"} className="h-5 px-1.5 text-[11px]">{item.subtitle}</Chip>}
                  {item.status === "done" && <Chip kind="status" className="h-5 px-1.5 text-[11px]">Done</Chip>}
                </div>
                {goal && !isBlock && (
                  <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-xs text-muted">
                    <span className="size-1.5 shrink-0 rounded-full" style={{ background: TYPE_COLOR.goal }} aria-hidden />
                    <span className="truncate">{goal.text}</span>
                  </div>
                )}
              </button>
            </div>
          </li>
        );
      })}
      {!nowPlaced && <li><NowRule /></li>}
    </ol>
  );
}

function NowRule() {
  return (
    <div className="flex items-center gap-2 py-1" aria-label="Now">
      <span className="w-14 shrink-0 text-right text-[11px] font-medium text-[#D7263D]">Now</span>
      <span className="size-1.5 rounded-full bg-danger" />
      <span className="h-px flex-1 bg-danger/70" />
    </div>
  );
}
