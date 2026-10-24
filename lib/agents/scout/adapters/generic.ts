// Any conference site: Bright Data Web Unlocker markdown (+ up to five agenda/sponsor pages) → LLM extraction → NormalizedConference.
// The LLM only transcribes what the pages list; ids and relationships come from the identity rules in upsert.
import { z } from "zod";
import { unlock } from "@/lib/brightdata";
import { hasLLM, structured } from "@/lib/llm";
import { assertResolvedPublic, publicUrlProblem, UnsafeUrlError } from "@/lib/publicUrl";
import { isoInZone, localToIso } from "@/lib/time";
import type { NormCompany, NormPerson, NormSession, NormalizedConference } from "../normalized";

const blank = z.string();

/** Spec §7 extraction schema. Empty string means the page didn't say. */
const Extracted = z.object({
  conference: z.object({
    name: blank,
    startDate: blank,
    endDate: blank,
    city: blank,
    region: blank,
    country: blank,
    timezone: blank,
  }),
  sessions: z.array(z.object({
    title: blank,
    abstract: blank,
    kind: z.enum(["talk", "workshop", "keynote", "panel", "other"]),
    start: blank,
    end: blank,
    room: blank,
    url: blank,
    speakers: z.array(blank),
    topics: z.array(blank),
  })),
  people: z.array(z.object({
    name: blank,
    title: blank,
    company: blank,
    bio: blank,
    links: z.array(blank),
  })),
  companies: z.array(z.object({
    name: blank,
    website: blank,
    description: blank,
    sponsorTier: blank,
    booth: blank,
    hall: blank,
    topics: z.array(blank),
  })),
});
export type Extracted = z.infer<typeof Extracted>;

const SYSTEM = `You transcribe a conference website (markdown from one or more pages) into JSON.
Only include what the pages state. Never invent sessions, speakers, sponsors, dates or times. Use "" when a field is unknown.
- conference: name: the event's proper name including the year, e.g. 'KubeCon + CloudNativeCon Europe 2026' (never a page title like 'Schedule' or 'Agenda'), startDate/endDate as YYYY-MM-DD, venue city/region/country, IANA timezone of the venue if you can tell.
- sessions: every scheduled agenda item with a time. start and end are ISO-8601 datetimes. Prefer an offset when the page gives one (2026-12-03T10:00:00+00:00); otherwise a venue-local YYYY-MM-DDTHH:MM:SS. kind is talk, workshop, keynote, panel, or other. url is the session page if linked. speakers are names only. topics: 1-3 short lowercase subject tags.
- people: every named person (speakers and others) with title, company, bio, and links when the pages state them.
- companies: sponsors/exhibitors/partners. website, description, sponsorTier, booth number, hall, and topics when shown.`;

const AGENDA_LINK = /(agenda|schedule|program|sessions|speakers|sponsors?|exhibitors?|partners)/i;
const MAX_CHARS = 90_000;
/** Ingestion contract: follow at most five same-domain agenda/sponsor links. */
export const MAX_EXTRA_PAGES = 5;

/** SCOUT_EXTRA_PAGES clamped to 0..5. Missing or non-numeric values stay at the default of 2. */
export function extraPageCap(raw = process.env.SCOUT_EXTRA_PAGES): number {
  if (raw == null || raw === "") return Math.min(2, MAX_EXTRA_PAGES);
  const n = Number(raw);
  if (!Number.isFinite(n)) return Math.min(2, MAX_EXTRA_PAGES);
  return Math.min(MAX_EXTRA_PAGES, Math.max(0, Math.floor(n)));
}

/** Same-site links in markdown that look like agenda/speaker/sponsor pages. */
export function agendaLinks(md: string, base: string, max: number): string[] {
  const b = new URL(base);
  const out = new Set<string>();
  for (const m of md.matchAll(/\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g)) {
    try {
      const u = new URL(m[1], b);
      u.hash = "";
      if (u.host === b.host && AGENDA_LINK.test(u.pathname) && u.toString() !== b.toString() && !publicUrlProblem(u.toString())) out.add(u.toString());
    } catch {
      // ignore
    }
  }
  return [...out].sort((x, y) => x.length - y.length).slice(0, Math.max(0, max));
}

async function unlockPublic(url: string): Promise<{ data: string; collectedAt: string } | null> {
  if (publicUrlProblem(url)) return null;
  try {
    await assertResolvedPublic(url);
    return await unlock(url);
  } catch (e) {
    if (e instanceof UnsafeUrlError) return null;
    throw e;
  }
}

export async function genericExtract(url: string): Promise<{ extracted: Extracted; collectedAt: string; pages: string[] }> {
  if (!hasLLM()) throw new Error("no LLM configured for the generic import path");
  const first = await unlockPublic(url);
  if (!first) throw new UnsafeUrlError();
  const extra = agendaLinks(first.data, url, extraPageCap()).slice(0, MAX_EXTRA_PAGES);
  const more = await Promise.all(extra.map(async (u) => {
    try {
      const r = await unlockPublic(u);
      return r ? { u, md: r.data } : null;
    } catch {
      return null;
    }
  }));
  const pages = [{ u: url, md: first.data }, ...more.filter((x): x is { u: string; md: string } => Boolean(x))];
  const per = Math.floor(MAX_CHARS / pages.length);
  const text = pages.map((p) => `# PAGE ${p.u}\n\n${p.md.replace(/!\[[^\]]*\]\([^)]*\)/g, "").slice(0, per)}`).join("\n\n");
  const extracted = await structured(Extracted, SYSTEM, text, "conference");
  return { extracted, collectedAt: first.collectedAt, pages: pages.map((p) => p.u) };
}

const present = (s?: string | null) => {
  const t = s?.trim();
  return t ? t : undefined;
};

/** ISO with an offset, venue-local YYYY-MM-DDTHH:MM, or HH:MM on `fallbackDate`. */
function sessionInstant(value: string | null | undefined, fallbackDate: string | undefined, timeZone: string): string | undefined {
  const v = value?.trim() ?? "";
  if (!v) return undefined;
  const offset = v.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:\d{2})$/);
  if (offset) return `${offset[1]}:${offset[2] ?? "00"}${offset[3] === "Z" ? "+00:00" : offset[3]}`;
  const local = v.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2}))?$/);
  if (local) return localToIso(`${local[1]}:${local[2] ?? "00"}`, timeZone);
  const hm = v.match(/^(\d{1,2}):(\d{2})$/);
  if (hm && fallbackDate && /^\d{4}-\d{2}-\d{2}$/.test(fallbackDate)) {
    return localToIso(`${fallbackDate}T${hm[1].padStart(2, "0")}:${hm[2]}:00`, timeZone);
  }
  return undefined;
}

function plusMinutes(iso: string, minutes: number, timeZone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return isoInZone(new Date(d.getTime() + minutes * 60_000), timeZone);
}

/** Venue-local calendar date of an instant (not the date in whatever offset the string carries). */
function localDate(iso: string, timeZone: string): string | undefined {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

const nextDay = (ymd: string) => new Date(Date.parse(`${ymd}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** A time-only end sits on the start's venue-local day, or the next day when it would otherwise precede the start (overnight). */
function sessionEnd(value: string | null | undefined, start: string, timeZone: string): string | undefined {
  const day = localDate(start, timeZone);
  const end = sessionInstant(value, day, timeZone);
  if (!end || !day || !/^\d{1,2}:\d{2}$/.test(value?.trim() ?? "")) return end;
  const delta = Date.parse(end) - Date.parse(start);
  if (delta === 0) return undefined; // an echoed start time means "unknown end": the caller's default length applies
  return delta < 0 ? sessionInstant(value, nextDay(day), timeZone) : end;
}

function toPerson(p: Extracted["people"][number]): NormPerson | undefined {
  const name = present(p.name);
  if (!name) return undefined;
  const links = p.links.map((l) => l.trim()).filter(Boolean);
  return { name, title: present(p.title), company: present(p.company), bio: present(p.bio), links: links.length ? links : undefined };
}

export function extractedToNormalized(e: Extracted, opts: { id: string; url: string; timeZone: string; collectedAt: string }): NormalizedConference {
  const peopleByName = new Map<string, NormPerson>();
  for (const raw of e.people) {
    const person = toPerson(raw);
    if (person && !peopleByName.has(person.name.toLowerCase())) peopleByName.set(person.name.toLowerCase(), person);
  }
  const day = present(e.conference.startDate);
  const sessions: NormSession[] = [];
  for (const s of e.sessions) {
    const title = present(s.title);
    const start = sessionInstant(s.start, day, opts.timeZone);
    if (!title || !start) continue;
    const end = sessionEnd(s.end, start, opts.timeZone) ?? plusMinutes(start, 30, opts.timeZone);
    const speakers = s.speakers.map((name) => present(name)).filter((name): name is string => Boolean(name)).map((name) => {
      const known = peopleByName.get(name.toLowerCase());
      return known ? { ...known, name: known.name } : { name };
    });
    sessions.push({
      title,
      abstract: present(s.abstract),
      kind: s.kind,
      start,
      end,
      room: present(s.room),
      url: present(s.url),
      speakers,
      topics: s.topics.map((t) => t.trim()).filter(Boolean),
    });
  }
  const used = new Set(sessions.flatMap((s) => s.speakers.map((p) => p.name.toLowerCase())));
  const people = [...peopleByName.values()].filter((p) => !used.has(p.name.toLowerCase()));
  const dates = sessions.map((s) => s.start.slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const startDate = present(e.conference.startDate) ?? dates[0] ?? "";
  const companies: NormCompany[] = e.companies.flatMap((c) => {
    const name = present(c.name);
    if (!name) return [];
    // A hall with no booth label is not a booth: no Booth node is invented from it.
    const label = present(c.booth);
    return [{
      name,
      website: present(c.website),
      description: present(c.description),
      sponsorTier: present(c.sponsorTier),
      topics: c.topics.map((t) => t.trim()).filter(Boolean),
      booth: label ? { label, hall: present(c.hall) } : undefined,
    }];
  });
  return {
    conference: {
      id: opts.id,
      name: e.conference.name,
      url: opts.url,
      startDate,
      endDate: present(e.conference.endDate) ?? dates[dates.length - 1] ?? startDate,
      city: present(e.conference.city),
      timezone: opts.timeZone,
    },
    provenance: { source: opts.url, collectedAt: opts.collectedAt, via: "unlocker" },
    sessions,
    companies,
    people: people.length ? people : undefined,
  };
}
