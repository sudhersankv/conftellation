// Rejects URLs the importer must never fetch: non-http(s), localhost, and private or link-local addresses.
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export class UnsafeUrlError extends Error {
  constructor(message = "URL host is not public") {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

type LookupAll = (hostname: string, options: { all: true; verbatim: true }) => Promise<{ address: string; family: number }[]>;

let lookupHost: LookupAll = (hostname, options) => dnsLookup(hostname, options);

/** Tests swap the resolver so a public-looking name can resolve to a private address. */
export function _setLookupForTests(fn: LookupAll | null) {
  lookupHost = fn ?? ((hostname, options) => dnsLookup(hostname, options));
}

export function bareHost(hostname: string): string {
  let host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  const zone = host.indexOf("%");
  return zone >= 0 ? host.slice(0, zone) : host;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  if (nums.some((n) => !Number.isInteger(n) || n > 255)) return null;
  return (((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0);
}

/** Private, loopback, link-local, CGNAT, and other non-global IPv4 ranges. */
export function blockedIPv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n == null) return true;
  const a = n >>> 24;
  const b = (n >>> 16) & 255;
  const c = (n >>> 8) & 255;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true;
  return false;
}

function expandIPv6(ip: string): string | null {
  let s = ip.toLowerCase();
  if (s.includes(".")) {
    const last = s.lastIndexOf(":");
    const v4 = ipv4ToInt(s.slice(last + 1));
    if (v4 == null) return null;
    s = `${s.slice(0, last + 1)}${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (halves.length === 1) {
    if (left.length !== 8 || left.some((p) => !/^[0-9a-f]{1,4}$/.test(p))) return null;
    return left.map((p) => p.padStart(4, "0")).join(":");
  }
  const missing = 8 - left.length - right.length;
  if (missing < 1) return null;
  if ([...left, ...right].some((p) => !/^[0-9a-f]{1,4}$/.test(p))) return null;
  return [...left, ...Array(missing).fill("0"), ...right].map((p) => p.padStart(4, "0")).join(":");
}

function last32(full: string): number | null {
  const groups = full.split(":");
  if (groups.length !== 8) return null;
  const hi = parseInt(groups[6], 16);
  const lo = parseInt(groups[7], 16);
  if (!Number.isFinite(hi) || !Number.isFinite(lo)) return null;
  return ((hi << 16) | lo) >>> 0;
}

function intToIpv4(n: number): string {
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

/** Loopback, unspecified, unique-local, link-local, multicast, and IPv4-mapped private addresses. */
export function blockedIPv6(ip: string): boolean {
  const full = expandIPv6(ip);
  if (!full) return true;
  if (full === "0000:0000:0000:0000:0000:0000:0000:0000" || full === "0000:0000:0000:0000:0000:0000:0000:0001") return true;
  const head = parseInt(full.slice(0, 4), 16);
  if ((head & 0xfe00) === 0xfc00) return true;
  if ((head & 0xffc0) === 0xfe80) return true;
  if ((head & 0xff00) === 0xff00) return true;
  if (full.startsWith("2001:0db8:")) return true;
  const mapped = full.startsWith("0000:0000:0000:0000:0000:ffff:") || full.startsWith("0064:ff9b:0000:0000:0000:0000:");
  if (mapped) {
    const n = last32(full);
    return n == null || blockedIPv4(intToIpv4(n));
  }
  return false;
}

export function isBlockedAddress(address: string): boolean {
  const host = bareHost(address);
  const kind = isIP(host);
  if (kind === 4) return blockedIPv4(host);
  if (kind === 6) return blockedIPv6(host);
  return false;
}

function blockedName(host: string): boolean {
  return host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal");
}

/** Null when the URL is safe to fetch. Otherwise a message safe to show the caller. */
export function publicUrlProblem(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "not a URL";
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "not a web URL";
  const host = bareHost(u.hostname);
  if (!host || blockedName(host) || isBlockedAddress(host)) return "URL host is not public";
  if (!isIP(host) && !host.includes(".")) return "not a web URL";
  return null;
}

export function assertPublicUrl(raw: string): string {
  const problem = publicUrlProblem(raw);
  if (problem) throw new UnsafeUrlError(problem);
  const u = new URL(raw);
  u.hash = "";
  return u.toString();
}

/** Resolve the host and refuse any private or reserved answer. DNS failure is left for the fetch to surface. */
export async function assertResolvedPublic(raw: string): Promise<void> {
  const url = assertPublicUrl(raw);
  const host = bareHost(new URL(url).hostname);
  if (isIP(host)) return;
  let answers: { address: string }[];
  try {
    answers = await lookupHost(host, { all: true, verbatim: true });
  } catch {
    return;
  }
  if (answers.length === 0 || answers.some((a) => isBlockedAddress(a.address))) throw new UnsafeUrlError("URL host is not public");
}
