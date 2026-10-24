import { TZ } from "@/lib/ui/format";

const f = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** "2026-10-24" in the conference timezone. */
export const dayKey = (d: string | Date) => f.format(typeof d === "string" ? new Date(d) : d);
export const sameDay = (a: string | Date, b: string | Date) => dayKey(a) === dayKey(b);
