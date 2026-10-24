// Any conference site: Bright Data Web Unlocker markdown (+ a few agenda/sponsor pages) → LLM extraction → NormalizedConference.
// The LLM only transcribes what the pages list; ids and relationships come from the identity rules in upsert.
import { z } from "zod";
import { unlock } from "@/lib/brightdata";
import { hasLLM, structured } from "@/lib/llm";
import { localToIso } from "@/lib/time";
import type { NormalizedConference, NormSession } from "../normalized";

const Extracted = z.object({
  conference: z.object({
    name: z.string(),
    startDate: z.string().nullable(),
    endDate: z.string().nullable(),
    city: z.string().nullable(),
    region: z.string().nullable(),
    country: z.string().nullable(),
    timezone: z.string().nullable(),
  }),
  sessions: z.array(z.object({
    title: z.string(),
    abstract: z.string().nullable(),
    kind: z.enum(["talk", "workshop", "keynote", "panel", "other"]),
    date: z.string().nullable(),
    start: z.string().nullable(),
    end: z.string().nullable(),
    room: z.string().nullable(),
    speakers: z.array(z.object({ name: z.string(), title: z.string().nullable(), company: z.string().nullable() })),
    topics: z.array(z.string()),
  })),
  sponsors: z.array(z.object({ name: z.string(), website: z.string().nullable(), tier: z.string().nullable(), description: z.string().nullable() })),
});
export type Extracted = z.infer<typeof Extracted>;

const SYSTEM = `You transcribe a conference website (markdown from one or more pages) into JSON.
Only include what the pages state. Never invent sessions, speakers, sponsors, dates or times.
- conference: official name (with year if shown), startDate/endDate as YYYY-MM-DD, venue city/region/country, IANA timezone of the venue if you can tell.
- sessions: every scheduled agenda item with a time. date YYYY-MM-DD, start/end as local 24h HH:MM at the venue. kind from the format. topics: 1-3 short lowercase subject tags.
- sponsors: sponsors/exhibitors/partners listed, with website and tier if shown.`;

const AGENDA_LINK = /(agenda|schedule|program|sessions|speakers|sponsors?|exhibitors?|partners)/i;
const MAX_CHARS = 90_000;

/** Same-site links in markdown that look like agenda/speaker/sponsor pages. */
export function agendaLinks(md: string, base: string, max: number): string[] {
  const b = new URL(base);
  const out = new Set<string>();
  for (const m of md.matchAll(/\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g)) {
    try {
      const u = new URL(m[1], b);
      u.hash = "";
      if (u.host === b.host && AGENDA_LINK.test(u.pathname) && u.toString() !== b.toString()) out.add(u.toString());
    } catch {
      // ignore
    }
  }
  return [...out].sort((x, y) => x.length - y.length).slice(0, max);
}

export async function genericExtract(url: string): Promise<{ extracted: Extracted; collectedAt: string; pages: string[] }> {
  if (!hasLLM()) throw new Error("no LLM configured for the generic import path");
  const first = await unlock(url);
  const extra = agendaLinks(first.data, url, Number(process.env.SCOUT_EXTRA_PAGES ?? 2));
  const more = await Promise.all(extra.map((u) => unlock(u).then((r) => ({ u, md: r.data })).catch(() => null)));
  const pages = [{ u: url, md: first.data }, ...more.filter((x): x is { u: string; md: string } => Boolean(x))];
  const per = Math.floor(MAX_CHARS / pages.length);
  const text = pages.map((p) => `# PAGE ${p.u}\n\n${p.md.replace(/!\[[^\]]*\]\([^)]*\)/g, "").slice(0, per)}`).join("\n\n");
  const extracted = await structured(Extracted, SYSTEM, text, "conference");
  return { extracted, collectedAt: first.collectedAt, pages: pages.map((p) => p.u) };
}

const hhmm = (t: string | null) => t?.match(/^(\d{1,2}):(\d{2})/);

export function extractedToNormalized(e: Extracted, opts: { id: string; url: string; timeZone: string; collectedAt: string }): NormalizedConference {
  const sessions: NormSession[] = [];
  for (const s of e.sessions) {
    const date = s.date ?? e.conference.startDate;
    const st = hhmm(s.start);
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !st) continue;
    const en = hhmm(s.end);
    const start = localToIso(`${date}T${st[1].padStart(2, "0")}:${st[2]}:00`, opts.timeZone);
    const end = en
      ? localToIso(`${date}T${en[1].padStart(2, "0")}:${en[2]}:00`, opts.timeZone)
      : localToIso(new Date(Date.parse(`${date}T${st[1].padStart(2, "0")}:${st[2]}:00Z`) + 30 * 60_000).toISOString().slice(0, 19), opts.timeZone);
    sessions.push({
      title: s.title.trim(),
      abstract: s.abstract ?? undefined,
      kind: s.kind,
      start,
      end,
      room: s.room ?? undefined,
      speakers: s.speakers.map((p) => ({ name: p.name, title: p.title ?? undefined, company: p.company ?? undefined })),
      topics: s.topics,
    });
  }
  const dates = sessions.map((s) => s.start.slice(0, 10)).sort();
  return {
    conference: {
      id: opts.id,
      name: e.conference.name,
      url: opts.url,
      startDate: e.conference.startDate ?? dates[0] ?? "",
      endDate: e.conference.endDate ?? e.conference.startDate ?? dates[dates.length - 1] ?? "",
      city: e.conference.city ?? undefined,
      timezone: opts.timeZone,
    },
    provenance: { source: opts.url, collectedAt: opts.collectedAt, via: "unlocker" },
    sessions,
    companies: e.sponsors.map((s) => ({ name: s.name, website: s.website ?? undefined, sponsorTier: s.tier ?? undefined, description: s.description ?? undefined, topics: [] })),
  };
}
