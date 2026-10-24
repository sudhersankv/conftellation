// Time helpers for the plan calendar: venue-zone day keys, minutes-of-day, lane layout.
import type { ItinerarySlot, PlanItem, PlanItemType, SteerOp } from "@/lib/types";
import { TYPE_COLOR } from "@/lib/ui/tokens";
import { fmtTime, TZ } from "@/lib/ui/format";

const fmts = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string, kind: "day" | "hm") {
  const k = `${tz}|${kind}`;
  let f = fmts.get(k);
  if (!f) {
    f = kind === "day"
      ? new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
      : new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    fmts.set(k, f);
  }
  return f;
}

/** "2026-10-24" in the venue zone. */
export const dayKey = (iso: string | Date, tz = TZ) => dtf(tz, "day").format(typeof iso === "string" ? new Date(iso) : iso);

/** Minutes since local midnight in the venue zone. */
export function minuteOfDay(iso: string | Date, tz = TZ) {
  const p = dtf(tz, "hm").formatToParts(typeof iso === "string" ? new Date(iso) : iso);
  const h = Number(p.find((x) => x.type === "hour")?.value ?? 0) % 24;
  const m = Number(p.find((x) => x.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

/** Every date from start to end inclusive ("YYYY-MM-DD"). */
export function dayRange(startDate: string, endDate: string): string[] {
  const a = new Date(`${startDate.slice(0, 10)}T12:00:00Z`);
  const b = new Date(`${(endDate || startDate).slice(0, 10)}T12:00:00Z`);
  const out: string[] = [];
  for (let d = a; d <= b && out.length < 31; d = new Date(d.getTime() + 864e5)) out.push(d.toISOString().slice(0, 10));
  return out.length ? out : [startDate.slice(0, 10)];
}

/** "Sat, Oct 24" for a date key (noon UTC avoids zone drift). */
export const dayLabel = (key: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(`${key}T12:00:00Z`));
export const dayShort = (key: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", day: "numeric" }).format(new Date(`${key}T12:00:00Z`));

/** "Oct 24, 2026" or "Nov 9–12, 2026" */
export function dateRangeLabel(startDate: string, endDate: string) {
  const f = (k: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...o }).format(new Date(`${k.slice(0, 10)}T12:00:00Z`));
  const s = startDate.slice(0, 10), e = (endDate || startDate).slice(0, 10);
  if (s === e) return f(s, { month: "short", day: "numeric", year: "numeric" });
  if (s.slice(0, 7) === e.slice(0, 7)) return `${f(s, { month: "short", day: "numeric" })}–${f(e, { day: "numeric" })}, ${f(e, { year: "numeric" })}`;
  return `${f(s, { month: "short", day: "numeric" })} – ${f(e, { month: "short", day: "numeric", year: "numeric" })}`;
}

export const hourLabel = (h: number) => (h === 0 || h === 24 ? "12 AM" : h === 12 ? "12 PM" : h < 12 ? `${h} AM` : `${h - 12} PM`);

export interface LaidOut { slot: ItinerarySlot; start: number; end: number; lane: number; lanes: number }

/** Assign overlapping slots to side-by-side lanes (per overlap cluster). */
export function layoutLanes(slots: ItinerarySlot[], tz: string): LaidOut[] {
  const items = slots
    .map((slot) => { const start = minuteOfDay(slot.from, tz); return { slot, start, end: Math.max(start + 10, minuteOfDay(slot.to, tz) || 1440), lane: 0, lanes: 1 }; })
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const out: LaidOut[] = [];
  let cluster: LaidOut[] = [], laneEnds: number[] = [], clusterEnd = -1;
  const flush = () => { cluster.forEach((c) => (c.lanes = laneEnds.length)); out.push(...cluster); cluster = []; laneEnds = []; };
  for (const it of items) {
    if (it.start >= clusterEnd && cluster.length) flush();
    let lane = laneEnds.findIndex((e) => e <= it.start);
    if (lane < 0) { lane = laneEnds.length; laneEnds.push(it.end); } else laneEnds[lane] = it.end;
    it.lane = lane;
    cluster.push(it);
    clusterEnd = Math.max(cluster.length === 1 ? it.end : clusterEnd, it.end);
  }
  if (cluster.length) flush();
  return out;
}

export const BLOCK_GREY = "#5C5C70";
/** Accepted meets get a teal edge on the calendar (DESIGN.md §5 Plan: "meets = teal edge"). */
export const MEET_EDGE = "#14B8A6";

export function typeColor(t: PlanItemType) {
  return t === "block" ? BLOCK_GREY : t === "booth" ? TYPE_COLOR.booth : t === "meet" ? MEET_EDGE : t === "person" ? TYPE_COLOR.person : TYPE_COLOR.session;
}

/** Display title: meets read "Meet · <other person>" (backend sends "Meet <name>"); everything else as-is. */
export function itemTitle(item: PlanItem): string {
  if (item.type !== "meet") return item.title;
  const name = item.person?.name ?? item.title.replace(/^meet\s*(·|with)?\s*/i, "").trim();
  return name ? `Meet · ${name}` : "Meet";
}

/** Human chip for a steer op: "set_window → 3:00 PM", "boost tracing". */
export function opLabel(op: SteerOp, tz = TZ): string {
  const t = (iso: string | null) => (iso ? fmtTime(iso, tz) : "open");
  switch (op.op) {
    case "set_window": return op.to && !op.from ? `leave ${t(op.to)}` : op.from && !op.to ? `arrive ${t(op.from)}` : `window ${t(op.from)}–${t(op.to)}`;
    case "block_time": return `${op.label} ${t(op.from)}–${t(op.to)}`;
    case "unblock_time": return `unblock ${t(op.from)}`;
    case "booth_time": return `booths ${op.minutes} min`;
    case "exclude": return `less ${op.match}`;
    case "boost": return `more ${op.match}`;
    case "add_goal": return `goal: ${op.text}`;
    case "remove_goal": return "remove goal";
    case "reweight_goal": return `reweight goal ${op.weight}`;
    case "pin": return "pin";
    case "clear": return `clear ${op.targetIds.length}`;
  }
}
