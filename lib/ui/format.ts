// Intl-based formatters. Narrow no-break spaces are normalised so Node and Chrome agree (no hydration mismatch).
export const TZ = "America/Los_Angeles";

const fmts = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string, key: string, o: Intl.DateTimeFormatOptions) {
  const k = `${tz}|${key}`;
  let f = fmts.get(k);
  if (!f) fmts.set(k, (f = new Intl.DateTimeFormat("en-US", { ...o, timeZone: tz })));
  return f;
}
const clean = (s: string) => s.replace(/[  ]/g, " ");

const TIME: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

/** "1:30 PM" */
export const fmtTime = (iso: string, tz = TZ) => clean(dtf(tz, "t", TIME).format(new Date(iso)));

/** "1:00–1:30 PM" or "11:30 AM–12:15 PM" */
export function fmtRange(from: string, to: string, tz = TZ) {
  const f = dtf(tz, "t", TIME);
  const parts = (iso: string) => {
    const p = f.formatToParts(new Date(iso));
    const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
    return { clock: `${g("hour")}:${g("minute")}`, period: g("dayPeriod").toUpperCase() };
  };
  const a = parts(from), b = parts(to);
  return a.period === b.period ? `${a.clock}–${b.clock} ${b.period}` : `${a.clock} ${a.period}–${b.clock} ${b.period}`;
}

/** "Sat, Oct 24" */
export const fmtDay = (iso: string, tz = TZ) => clean(dtf(tz, "d", { weekday: "short", month: "short", day: "numeric" }).format(new Date(iso)));

/** "just now", "12m ago", "2h ago", "3d ago" */
export function ago(iso: string, now = Date.now()) {
  const m = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (!(m >= 1)) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

/** "in 12 min", "in 1 h 5 min", "now" */
export function fmtIn(iso: string, now = Date.now()) {
  const m = Math.ceil((new Date(iso).getTime() - now) / 60000);
  if (!(m > 0)) return "now";
  if (m < 60) return `in ${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `in ${h} h ${r} min` : `in ${h} h`;
}
