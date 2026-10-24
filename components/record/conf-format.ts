// Conference date helpers shared by Home, Add and Me. Dates are plain ISO dates ("2026-10-24"); format at noon UTC so no zone shifts the day.
import type { Conference } from "@/lib/types";

const day = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`);
const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { ...o, timeZone: "UTC" }).format(day(d));

/** "Oct 24, 2026" or "Nov 9–12, 2026" or "Oct 30 – Nov 2, 2026" */
export function fmtConfDates(c: Pick<Conference, "startDate" | "endDate">) {
  if (!c.startDate) return "";
  const end = c.endDate || c.startDate;
  const year = fmt(end, { year: "numeric" });
  if (c.startDate.slice(0, 10) === end.slice(0, 10)) return `${fmt(c.startDate, { month: "short", day: "numeric" })}, ${year}`;
  const sameMonth = c.startDate.slice(0, 7) === end.slice(0, 7);
  return sameMonth
    ? `${fmt(c.startDate, { month: "short", day: "numeric" })}–${fmt(end, { day: "numeric" })}, ${year}`
    : `${fmt(c.startDate, { month: "short", day: "numeric" })} – ${fmt(end, { month: "short", day: "numeric" })}, ${year}`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** Known demo conferences, shown as "Already imported" even before the user has a record there. */
export const DEMO_CONFS: { id: string; name: string }[] = [
  { id: "ptc-2026", name: "Patch the Conference" },
  { id: "kubecon-cloudnativecon-north-america-2026", name: "KubeCon + CloudNativeCon North America" },
];
