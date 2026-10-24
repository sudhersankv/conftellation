// Scout: any conference URL -> NormalizedConference -> shared graph.
// Router: RainFocus (known sites) -> Sessionize -> sched/.ics -> generic (Bright Data Unlocker + LLM). Sponsor pages are read on every path
// that doesn't bring its own, and the top sponsors are enriched from their own sites (enrich.ts).
import { fetchJson, fetchText, requestsUsed } from "@/lib/brightdata";
import { assertResolvedPublic, publicUrlProblem, UnsafeUrlError } from "@/lib/publicUrl";
import { ensureIndexes } from "@/lib/schema";
import type { AddConferenceResponse, Conference } from "@/lib/types";
import { conferenceById, conferenceByUrl, conferenceCounts } from "@/lib/queries/conferences";
import { RAINFOCUS_SITES, fetchRainFocus } from "./adapters/rainfocus";
import { sessionizeToNormalized, sessionizeUrl, type SessionizeAll } from "./adapters/sessionize";
import { icsToNormalized, icsVenue, parseIcs } from "./adapters/ics";
import { extractedToNormalized, genericExtract } from "./adapters/generic";
import { enrichSponsors, type EnrichResult } from "./enrich";
import { jsonLdEvent, links, meta, normalizeUrl, schedHost, sessionizeCodes, sponsorLogos, title, type PageEvent } from "./html";
import { slug, type NormCompany, type NormalizedConference } from "./normalized";
import { venueTimeZone } from "./timezone";
import { upsertConference } from "./upsert";

export class BadInput extends Error {}

export type ScoutPath = "rainfocus" | "sessionize" | "ics" | "generic";

export interface ImportResult {
  response: AddConferenceResponse;
  path?: ScoutPath;
  enrich?: EnrichResult;
  brightDataRequests: number;
  ms: number;
}

export async function importConference(rawUrl: string, opts: { enrich?: boolean } = {}): Promise<ImportResult> {
  const t0 = Date.now();
  const bd0 = requestsUsed();
  const fetchUrl = parseUrl(rawUrl);
  const hit = await conferenceByUrl(urlVariants(normalizeUrl(fetchUrl)));
  if (hit) {
    return { response: { conference: hit, counts: await conferenceCounts(hit.id), cached: true }, brightDataRequests: 0, ms: Date.now() - t0 };
  }
  let built: { norm: NormalizedConference; path: ScoutPath };
  try {
    built = await buildNormalized(fetchUrl);
  } catch (e) {
    if (e instanceof UnsafeUrlError) throw new BadInput(e.message);
    throw e;
  }
  const { norm, path } = built;
  const conferenceHost = (() => {
    try {
      return new URL(norm.conference.url).hostname;
    } catch {
      return undefined;
    }
  })();
  const enrich = opts.enrich === false || norm.companies.length === 0 ? undefined : await enrichSponsors(norm.companies, { context: norm.conference.name, conferenceHost });
  await ensureIndexes();
  const r = await upsertConference(norm);
  const conference = (await conferenceById(norm.conference.id)) as Conference;
  return {
    response: { conference, counts: r.counts, cached: false },
    path, enrich, brightDataRequests: requestsUsed() - bd0, ms: Date.now() - t0,
  };
}

function parseUrl(raw: string): string {
  const trimmed = raw.trim();
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new BadInput("not a URL");
  }
  const problem = publicUrlProblem(u.toString());
  if (problem) throw new BadInput(problem);
  u.hash = "";
  return u.toString();
}

/** Slash and http/https forms. The query string stays intact; only the path gains or loses a trailing slash. */
export function urlVariants(raw: string): string[] {
  const out = new Set<string>();
  for (const value of [raw, raw.replace(/^https:/i, "http:")]) {
    let u: URL;
    try {
      u = new URL(value);
    } catch {
      continue;
    }
    const forms = [new URL(u), new URL(u)];
    if (!forms[1].pathname.endsWith("/")) forms[1].pathname += "/";
    const bare = new URL(u);
    if (bare.pathname.length > 1 && bare.pathname.endsWith("/")) bare.pathname = bare.pathname.replace(/\/+$/, "");
    for (const form of [...forms, bare]) out.add(form.toString());
    out.add(value);
  }
  return [...out];
}

async function readText(url: string, init?: RequestInit): Promise<{ data: string; collectedAt: string } | null> {
  if (publicUrlProblem(url)) return null;
  try {
    await assertResolvedPublic(url);
    return await fetchText(url, init);
  } catch {
    return null;
  }
}

/** Fetch + normalize without touching the graph (also used by scripts/prewarm-kubecon.ts). `conference.url` is the normalized URL (the cache key). */
export async function buildNormalized(url: string): Promise<{ norm: NormalizedConference; path: ScoutPath }> {
  await assertResolvedPublic(url);
  const r = await route(url);
  r.norm.conference.url = normalizeUrl(url);
  return r;
}

async function route(url: string): Promise<{ norm: NormalizedConference; path: ScoutPath }> {
  const host = new URL(url).hostname.toLowerCase();

  const rf = RAINFOCUS_SITES.find((s) => s.hosts.includes(host));
  if (rf) return { norm: { ...(await fetchRainFocus(rf, (u, init) => fetchJson(u, init))), conference: { ...rf.conference, url } }, path: "rainfocus" };

  if (host === "sessionize.com") {
    const sz = await firstSessionize(sessionizeCodes(url));
    if (!sz) throw new BadInput("Sessionize URL without a public API code");
    return { norm: await fromSessionize(sz, url, {}), path: "sessionize" };
  }

  if (/\.ics(\?|$)/i.test(url)) return { norm: await fromIcs(url, url, {}), path: "ics" };
  if (/\.sched\.com$/.test(host)) {
    const html = await readText(url, { headers: { Accept: "text/html" } });
    const norm = await fromIcs(`https://${host}/all.ics`, url, html?.data ? metaEvent(html.data) : {});
    if (html?.data) {
      const sponsors = await findSponsors(html.data, url);
      if (sponsors.length) norm.companies = sponsors;
    }
    return { norm, path: "ics" };
  }

  let html: string | undefined;
  const page = await readText(url, { headers: { Accept: "text/html" } });
  html = page?.data;

  if (html) {
    if (html.trimStart().startsWith("BEGIN:VCALENDAR")) return { norm: await fromIcs(url, url, {}), path: "ics" };
    const ev: PageEvent = { ...metaEvent(html), ...stripUndef(jsonLdEvent(html) ?? {}) };
    let sz = await firstSessionize(sessionizeCodes(html));
    let sched = sz ? undefined : schedHost(url, html);
    if (!sz && !sched) {
      for (const link of links(html, url, /schedule|agenda|program/i).slice(0, 3)) {
        const sub = await readText(link);
        if (!sub) continue;
        sz = await firstSessionize(sessionizeCodes(sub.data));
        sched = sz ? undefined : schedHost(link, sub.data);
        if (sz || sched) break;
      }
    }
    if (sz || sched) {
      const sponsors = await findSponsors(html, url);
      const norm = sz ? await fromSessionize(sz, url, ev) : await fromIcs(`https://${sched}/all.ics`, url, ev);
      norm.companies = sponsors;
      return { norm, path: sz ? "sessionize" : "ics" };
    }
  }

  const { extracted, collectedAt } = await genericExtract(url);
  const tz = await venueTimeZone({ city: extracted.conference.city ?? undefined, region: extracted.conference.region ?? undefined, country: extracted.conference.country ?? undefined, hint: extracted.conference.timezone });
  const norm = extractedToNormalized(extracted, { id: confId(extracted.conference.name, extracted.conference.startDate ?? undefined), url, timeZone: tz, collectedAt });
  if (norm.sessions.length === 0) throw new BadInput("couldn't find a timed agenda on that page");
  return { norm, path: "generic" };
}

type SessionizeHit = { code: string; data: SessionizeAll; collectedAt: string };

/** First code whose public "All" view answers with sessions (pages also embed codes for other views). */
async function firstSessionize(codes: string[]): Promise<SessionizeHit | undefined> {
  for (const code of codes.slice(0, 4)) {
    const r = await fetchJson<SessionizeAll>(sessionizeUrl(code)).catch(() => null);
    if (r?.data?.sessions?.length) return { code, data: r.data, collectedAt: r.collectedAt };
  }
  return undefined;
}

async function fromSessionize(hit: SessionizeHit, url: string, ev: PageEvent): Promise<NormalizedConference> {
  const timeZone = await venueTimeZone(ev);
  const name = ev.name ?? `Sessionize event ${hit.code}`;
  const norm = sessionizeToNormalized({
    data: hit.data,
    conference: { id: "", name, url, startDate: ev.startDate ?? "", endDate: ev.endDate ?? "", city: ev.city, timezone: timeZone },
    source: sessionizeUrl(hit.code), collectedAt: hit.collectedAt, timeZone, idPrefix: `sz-${hit.code.toLowerCase()}`,
  });
  fillDates(norm);
  norm.conference.id = confId(name, norm.conference.startDate);
  return norm;
}

async function fromIcs(icsUrl: string, url: string, ev: PageEvent): Promise<NormalizedConference> {
  const r = await fetchText(icsUrl);
  const events = parseIcs(r.data);
  if (events.length === 0) throw new BadInput("calendar feed has no events");
  const venue = { ...icsVenue(events), ...stripUndef(ev) };
  const timeZone = await venueTimeZone(venue);
  const calName = r.data.match(/^X-WR-CALNAME:(.+)$/m)?.[1]?.trim();
  const name = ev.name ?? calName ?? new URL(url).hostname;
  const norm = icsToNormalized({
    events, source: icsUrl, collectedAt: r.collectedAt, timeZone, idPrefix: `ics-${slug(name).slice(0, 24)}`,
    conference: { id: "", name, url, startDate: ev.startDate ?? "", endDate: ev.endDate ?? "", city: venue.city, timezone: timeZone },
  });
  fillDates(norm);
  norm.conference.id = confId(name, norm.conference.startDate);
  return norm;
}

/** Sponsor logo wall on a linked sponsors page (or on the page itself). Name + URL + tier; enrichment adds the rest. */
async function findSponsors(html: string, url: string): Promise<NormCompany[]> {
  const candidates = links(html, url, /sponsor|exhibitor|partner/i)
    .sort((a, b) => Number(/sponsor-?list|sponsors\/?$/i.test(b)) - Number(/sponsor-?list|sponsors\/?$/i.test(a)));
  for (const link of [url, ...candidates.slice(0, 2)]) {
    const page = link === url ? { data: html, collectedAt: new Date().toISOString() } : await readText(link);
    const found = page ? sponsorLogos(page.data) : [];
    if (found.length) {
      return found
        .filter((s) => !/media/i.test(s.tier ?? ""))
        .map((s) => ({ name: s.name, website: s.url, sponsorTier: s.tier, topics: [], provenance: { source: link, collectedAt: page!.collectedAt, via: "web" as const } }));
    }
  }
  return [];
}

function metaEvent(html: string): PageEvent {
  const name = (meta(html, "og:title") ?? title(html))?.split(/\s+[|\u2013\u2014]\s+/)[0]?.trim();
  return name ? { name } : {};
}

function fillDates(n: NormalizedConference) {
  const days = n.sessions.map((s) => s.start.slice(0, 10)).sort();
  if (!n.conference.startDate) n.conference.startDate = days[0] ?? "";
  if (!n.conference.endDate) n.conference.endDate = days[days.length - 1] ?? n.conference.startDate;
}

export function confId(name: string, startDate?: string): string {
  const year = startDate?.slice(0, 4);
  return slug(year && /^\d{4}$/.test(year) && !name.includes(year) ? `${name} ${year}` : name);
}

function stripUndef<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) as Partial<T>;
}
