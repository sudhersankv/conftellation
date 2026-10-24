// Build an ISO datetime with the venue's UTC offset, e.g. ("2026-10-24", "09:00", "America/Los_Angeles") → "2026-10-24T09:00:00-07:00".
export function offsetFor(dateIso: string, tz: string): string {
  try {
    const probe = new Date(`${dateIso.slice(0, 10)}T12:00:00Z`);
    const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(probe).find((p) => p.type === "timeZoneName")?.value ?? "";
    const m = part.match(/GMT([+-]\d{2}):?(\d{2})?/);
    if (!m) return "+00:00";
    return `${m[1]}:${m[2] ?? "00"}`;
  } catch {
    return "-07:00";
  }
}

export const zonedIso = (dateIso: string, hhmm: string, tz: string) => `${dateIso.slice(0, 10)}T${hhmm}:00${offsetFor(dateIso, tz)}`;

/** "09:00" from an ISO with offset, read in the venue zone. */
export function hhmmIn(iso: string, tz: string): string {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return `${g("hour")}:${g("minute")}`;
}
