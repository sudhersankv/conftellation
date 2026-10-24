// ISO strings with an explicit offset in a venue timezone (the app runs on PT; venues vary).

export const PT = "America/Los_Angeles";

function offsetFor(date: Date, timeZone: string): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = part?.match(/GMT([+-]\d{2}):?(\d{2})?/);
  return m ? `${m[1]}:${m[2] ?? "00"}` : "+00:00";
}

/** Date (absolute instant) → "YYYY-MM-DDTHH:mm:ss±HH:MM" in `timeZone`. */
export function isoInZone(date: Date, timeZone = PT): string {
  const off = offsetFor(date, timeZone);
  const sign = off.startsWith("-") ? -1 : 1;
  const [h, m] = off.slice(1).split(":").map(Number);
  const local = new Date(date.getTime() + sign * (h * 60 + m) * 60_000);
  return `${local.toISOString().slice(0, 19)}${off}`;
}

/** Local wall time without offset ("2026-11-10T09:00:00") in `timeZone` → ISO with offset. */
export function localToIso(local: string, timeZone: string): string {
  const guess = new Date(`${local.slice(0, 19)}Z`);
  const off = offsetFor(guess, timeZone);
  return `${local.slice(0, 19)}${off}`;
}

export const ms = (iso: string) => new Date(iso).getTime();
