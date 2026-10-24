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

export function normalizeUrl(raw: string): string {
  const u = new URL(raw.trim());
  u.hash = "";
  u.host = u.host.toLowerCase();
  [...u.searchParams.keys()].filter((k) => /^utm_|^ref$|^fbclid$/.test(k)).forEach((k) => u.searchParams.delete(k));
  const s = u.toString();
  return u.pathname !== "/" && s.endsWith("/") && !u.search ? s.slice(0, -1) : s.replace(/\/$/, "");
}
