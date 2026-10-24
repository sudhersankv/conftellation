// iCalendar feed (sched.com /all.ics, any .ics agenda) → NormalizedConference. Times are converted to the venue timezone.
import type { SessionKind, Via } from "@/lib/types";
import { isoInZone, localToIso } from "@/lib/time";
import type { NormSession, NormalizedConference } from "../normalized";

export interface IcsEvent { [prop: string]: string | undefined }

export function parseIcs(text: string): IcsEvent[] {
  const lines = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
  const out: IcsEvent[] = [];
  let cur: IcsEvent | undefined;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT") {
      if (cur) out.push(cur);
      cur = undefined;
    } else if (cur) {
      const i = line.indexOf(":");
      if (i < 0) continue;
      const [name, ...params] = line.slice(0, i).split(";");
      cur[name.toUpperCase()] = unescape(line.slice(i + 1));
      const tzid = params.find((p) => p.startsWith("TZID="));
      if (tzid) cur[`${name.toUpperCase()}_TZID`] = tzid.slice(5);
    }
  }
  return out;
}

const unescape = (s: string) => s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();

/** "20251109T130000Z" → ISO in `tz`; floating times are read as venue-local. */
function icsTime(v: string, tz: string, tzid?: string): string {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/);
  if (!m) return isoInZone(new Date(v), tz);
  const local = `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? "00"}:${m[5] ?? "00"}:${m[6] ?? "00"}`;
  if (m[7]) return isoInZone(new Date(`${local}Z`), tz);
  return localToIso(local, tzid ?? tz);
}

const SKIP = /^(registration|breaks?|meals?|logistics)$/i;

export function icsToNormalized(opts: {
  events: IcsEvent[];
  conference: NormalizedConference["conference"];
  source: string;
  collectedAt: string;
  timeZone: string;
  idPrefix: string;
  via?: Via;
}): NormalizedConference {
  const sessions: NormSession[] = opts.events
    .filter((e) => e.SUMMARY && e.DTSTART && !SKIP.test(e.CATEGORIES ?? ""))
    .map((e) => {
      const start = icsTime(e.DTSTART!, opts.timeZone, e.DTSTART_TZID);
      const end = e.DTEND ? icsTime(e.DTEND, opts.timeZone, e.DTEND_TZID) : start;
      const cats = (e.CATEGORIES ?? "").split(",").map((c) => c.trim()).filter(Boolean);
      return {
        id: `${opts.idPrefix}-${(e.UID ?? e.SUMMARY!).replace(/@.*$/, "").replace(/[^a-z0-9]+/gi, "").slice(0, 40).toLowerCase()}`,
        title: e.SUMMARY!,
        abstract: e.DESCRIPTION || undefined,
        kind: kindOf(e.SUMMARY!, cats),
        start,
        end,
        room: e.LOCATION?.split(",")[0]?.trim() || undefined,
        url: e.URL,
        speakers: [],
        topics: cats.map((c) => c.toLowerCase()).slice(0, 4),
      };
    });
  return {
    conference: opts.conference,
    provenance: { source: opts.source, collectedAt: opts.collectedAt, via: opts.via ?? "ics" },
    sessions,
    companies: [],
  };
}

function kindOf(title: string, cats: string[]): SessionKind {
  const s = `${title} ${cats.join(" ")}`;
  if (/keynote/i.test(s)) return "keynote";
  if (/workshop|tutorial|lab\b/i.test(s)) return "workshop";
  if (/\bpanel\b/i.test(s)) return "panel";
  return "talk";
}

/** Venue hint from the first LOCATION ("Room, Atlanta, GA, USA" → city/region). */
export function icsVenue(events: IcsEvent[]): { city?: string; region?: string; country?: string } {
  const parts = events.find((e) => e.LOCATION?.includes(","))?.LOCATION?.split(",").map((p) => p.trim()) ?? [];
  if (parts.length >= 4) return { city: parts[parts.length - 3], region: parts[parts.length - 2], country: parts[parts.length - 1] };
  if (parts.length === 3) return { city: parts[1], region: parts[2] };
  return {};
}
