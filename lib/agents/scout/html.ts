// Small HTML readers for conference sites: JSON-LD Event, meta tags, links, platform fingerprints, sponsor blocks.

export interface PageEvent {
  name?: string;
  url?: string;
  startDate?: string;
  endDate?: string;
  city?: string;
  region?: string;
  country?: string;
}

const decode = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#8211;|&ndash;/g, "–");

export function meta(html: string, prop: string): string | undefined {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop.replace(/[.:]/g, "\\$&")}["'][^>]*content=["']([^"']*)["']`, "i");
  const m = html.match(re) ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, "i"));
  return m ? decode(m[1]).trim() : undefined;
}

export function title(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? decode(m[1]).trim() : undefined;
}

/** First schema.org Event (any *Event type) found in JSON-LD blocks. */
export function jsonLdEvent(html: string): PageEvent | undefined {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  for (const b of blocks) {
    let data: unknown;
    try {
      data = JSON.parse(b);
    } catch {
      continue;
    }
    const ev = findEvent(data);
    if (ev) {
      const loc = (Array.isArray(ev.location) ? ev.location[0] : ev.location) as Record<string, unknown> | undefined;
      const addr = (loc?.address ?? {}) as Record<string, string>;
      return {
        name: str(ev.name),
        url: str(ev.url),
        startDate: str(ev.startDate)?.slice(0, 10),
        endDate: str(ev.endDate)?.slice(0, 10),
        city: typeof addr === "string" ? undefined : addr.addressLocality,
        region: typeof addr === "string" ? undefined : addr.addressRegion,
        country: typeof addr === "string" ? undefined : str(addr.addressCountry),
      };
    }
  }
  return undefined;
}

function str(v: unknown): string | undefined {
  if (typeof v === "string") return decode(v).trim() || undefined;
  if (v && typeof v === "object" && "name" in v) return str((v as { name: unknown }).name);
  return undefined;
}

function findEvent(d: unknown): Record<string, unknown> | undefined {
  if (!d || typeof d !== "object") return undefined;
  if (Array.isArray(d)) {
    for (const x of d) {
      const e = findEvent(x);
      if (e) return e;
    }
    return undefined;
  }
  const o = d as Record<string, unknown>;
  const t = o["@type"];
  if ((Array.isArray(t) ? t : [t]).some((x) => typeof x === "string" && /Event$/.test(x)) && o.startDate) return o;
  return findEvent(o["@graph"]);
}

/** Absolute same-site links under `base`'s first path segment (hosts like events.linuxfoundation.org carry many events), matching `pattern`, shortest first. */
export function links(html: string, base: string, pattern: RegExp): string[] {
  const b = new URL(base);
  const first = b.pathname.split("/").filter(Boolean)[0];
  const prefix = first && !first.includes(".") ? `/${first}/` : "/";
  const out = new Set<string>();
  for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(decode(m[1]), b);
      if (u.host !== b.host || !u.pathname.startsWith(prefix) || !pattern.test(u.pathname)) continue;
      u.search = "";
      out.add(u.toString());
    } catch {
      // bad href
    }
  }
  return [...out].sort((x, y) => x.length - y.length);
}

/** Sessionize API code from an embed (`sessionize.com/api/v2/<code>/view/...`) or a `sessionizeApiCode` config. */
export function sessionizeCodes(text: string): string[] {
  const t = decodeURIComponentSafe(text.replace(/\\\//g, "/"));
  const config = [...t.matchAll(/sessionizeApiCode(?:&quot;|["'])\s*:\s*(?:&quot;|["'])([a-z0-9]{4,16})/gi)].map((m) => m[1]);
  const embeds = [...t.matchAll(/sessionize\.com\/api\/v2\/([a-z0-9]{4,16})\/view/gi)].map((m) => m[1]);
  return [...new Set([...config, ...embeds])];
}

function decodeURIComponentSafe(s: string): string {
  return s.replace(/%2F/gi, "/").replace(/%3A/gi, ":");
}

/** "<event>.sched.com" referenced by the page (or the page itself). */
export function schedHost(url: string, html = ""): string | undefined {
  const host = new URL(url).host;
  if (/\.sched\.com$/i.test(host)) return host;
  return html.match(/https?:\/\/([a-z0-9-]+\.sched\.com)/i)?.[1];
}

export interface SponsorLink { tier?: string; name: string; url?: string }

/** Logo-wall sponsor pages: a tier heading followed by `<a href title="Go to X">` / `<img alt="X logo">` entries. */
export function sponsorLogos(html: string): SponsorLink[] {
  const out: SponsorLink[] = [];
  const parts = html.split(/<h[2-4][^>]*class=["'][^"']*sponsors?-logos--header[^"']*["'][^>]*>/i);
  for (const part of parts.slice(1)) {
    const tier = decode(part.slice(0, part.indexOf("<")).trim());
    for (const m of part.matchAll(/<a([^>]+)>\s*<img[^>]+alt=["']([^"']*)["']/gi)) {
      const href = m[1].match(/href=["']([^"']+)["']/i)?.[1];
      const titled = m[1].match(/title=["'](?:Go to )?([^"']+)["']/i)?.[1];
      const name = decode((titled ?? m[2]).replace(/\s+logo$/i, "").trim());
      if (name && href) out.push({ tier, name, url: decode(href) });
    }
  }
  const seen = new Set<string>();
  return out.filter((s) => !seen.has(s.name.toLowerCase()) && seen.add(s.name.toLowerCase()));
}

/** Analytics/ad click ids that never change the page (Google `_gl`/`gclid`/`gbraid`/`wbraid`, Meta `fbclid`, `utm_*`, `ref`). */
const TRACKING_PARAM = /^(utm_.*|_gl|gclid|gbraid|wbraid|dclid|fbclid|msclkid|mc_cid|mc_eid|ref)$/i;

/** Drop tracking params only (the path, including a trailing slash, is untouched). */
export function stripTracking(raw: string): string {
  const u = new URL(raw.trim());
  const keys = [...u.searchParams.keys()].filter((k) => TRACKING_PARAM.test(k));
  if (!keys.length) return u.toString();
  keys.forEach((k) => u.searchParams.delete(k));
  return u.toString();
}

export function normalizeUrl(raw: string): string {
  const u = new URL(stripTracking(raw));
  u.hash = "";
  u.host = u.host.toLowerCase();
  const s = u.toString();
  return u.pathname !== "/" && s.endsWith("/") && !u.search ? s.slice(0, -1) : s.replace(/\/$/, "");
}

// ---------- conference names ----------

/** Words that are a page's role, not an event's name ("Schedule | AgntCon + MCPCon 2026" → the second part). */
const GENERIC_WORDS = [
  "schedule", "full schedule", "agenda", "program", "programme", "sessions", "session", "speakers", "speaker", "sponsors", "sponsor", "exhibitors",
  "home", "homepage", "home page", "welcome", "overview", "event", "events", "conference", "conferences", "register", "registration", "tickets",
  "attend", "about", "venue", "faq", "index", "page", "untitled", "calendar", "sched", "lf events", "linux foundation events", "general", "other",
  "misc", "tbd", "tba", "n/a", "none", "all", "all sessions", "keynotes", "talks",
];
const GENERIC = new Set(GENERIC_WORDS);
const YEAR_G = /(?<![0-9])(?:19|20)[0-9]{2}(?![0-9])/g;
const YEAR = /(?<![0-9])(20[0-9]{2})(?![0-9])/;

/** True when a candidate name is only page-role words, years and punctuation ("Schedule", "Agenda 2026", "Home | Sessions"). */
export function isGenericName(name?: string | null): boolean {
  if (!name) return true;
  let rest = ` ${name.toLowerCase().replace(/[|:,/()·•–—-]+/g, " ").replace(YEAR_G, " ").replace(/\s+/g, " ").trim()} `;
  for (const w of [...GENERIC_WORDS].sort((a, b) => b.length - a.length)) rest = rest.split(` ${w} `).join(" ");
  return rest.replace(/[^\p{L}\p{N}]+/gu, "").length < 2;
}

/** A topic that would just repeat a page role or the conference itself. */
export function isGenericTopic(id: string, confId?: string, confName?: string): boolean {
  const t = id.toLowerCase().trim();
  if (!t || GENERIC.has(t)) return true;
  const dashed = t.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (confId && (dashed === confId || confId.startsWith(`${dashed}-20`))) return true;
  if (confName) {
    const n = confName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (dashed === n || dashed === n.replace(/-(19|20)\d{2}$/, "")) return true;
  }
  return false;
}

/** Drop generic page-role parts: "Schedule | AgntCon + MCPCon North America | LF Events" → "AgntCon + MCPCon North America". */
export function stripTitle(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const parts = raw.split(/\s+[|–—-]\s+|\s*\|\s*/).map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const cleaned = part
      .replace(/^(?:(?:full\s+)?schedule|agenda|program(?:me)?|sessions|speakers|home|welcome(?:\s+to)?)\s*[:–—-]?\s+/i, "")
      .replace(/\s+(?:(?:full\s+)?schedule|agenda|program(?:me)?|sessions|speakers|home)$/i, "")
      .trim();
    if (!isGenericName(cleaned)) return cleaned;
  }
  return undefined;
}

const yearIn = (s?: string | null) => s?.match(YEAR)?.[1];

/**
 * The event's proper name from page signals, in order: JSON-LD Event name; og:site_name (+ the page's year); the og:title / <title>
 * with generic parts stripped. Undefined when the page only says "Schedule" and friends (caller falls back to the LLM, then the domain).
 */
export function pageName(html: string): string | undefined {
  const ld = jsonLdEvent(html);
  if (ld?.name && !isGenericName(ld.name)) return ld.name;
  const t = title(html);
  const ogTitle = meta(html, "og:title");
  const year = yearIn(ogTitle) ?? yearIn(t) ?? ld?.startDate?.slice(0, 4);
  const site = meta(html, "og:site_name");
  // Organizer-wide site names ("LF Events", "Sessionize") describe the host, not the event.
  if (site && !isGenericName(site) && !/(?:^| )events?$|^sessionize$|^sched$|^eventbrite$/i.test(site.trim())) {
    return year && !site.includes(year) ? `${site} ${year}` : site;
  }
  return stripTitle(ogTitle) ?? stripTitle(t);
}

/** Last resort: "events.agntcon.dev" → "Agntcon 2026". */
export function domainName(url: string, startDate?: string): string {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    // keep blank
  }
  const labels = host.split(".").filter(Boolean);
  // Platform subdomains carry the event ("kccncna2026.sched.com"); everywhere else the second-level domain does.
  const platform = /(^|\.)(sched\.com|sessionize\.com|pretalx\.com|eventbrite\.com)$/.test(host);
  const sld = (platform ? labels[0] : labels.length >= 2 ? labels[labels.length - 2] : labels[0]) ?? "conference";
  const word = sld.split(/[-_]+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const year = startDate?.slice(0, 4);
  return year && /^\d{4}$/.test(year) && !word.includes(year) ? `${word} ${year}` : word;
}
