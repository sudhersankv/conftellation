// Bright Data adapter (backend only) + cached plain-HTTP fetchers.
// Every response is cached on disk by sha1(request); a cache hit costs 0 credits.
// Bright Data calls (not plain fetches) count toward BRIGHTDATA_MAX_REQUESTS per process.
// Tests replace this module with vi.mock("@/lib/brightdata"), or point BRIGHTDATA_CACHE_DIR at fixtures.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const API = "https://api.brightdata.com";

export type BrightDataVia = "unlocker" | "serp" | "studio" | "scraper-api" | "http";

export interface Fetched<T> {
  data: T;
  cached: boolean;
  collectedAt: string; // when the response was first fetched
  via: BrightDataVia;
  source: string;
}

interface CacheEntry<T> {
  key: Record<string, unknown>;
  collectedAt: string;
  via: BrightDataVia;
  source: string;
  data: T;
}

let used = 0;
export const requestsUsed = () => used;
export const resetRequestCount = () => void (used = 0);

const cacheDir = () => process.env.BRIGHTDATA_CACHE_DIR ?? path.join(process.cwd(), "seed", "raw", "cache");
const maxRequests = () => Number(process.env.BRIGHTDATA_MAX_REQUESTS ?? 200);
/** CACHE_ONLY=true: never touch the network; a cache miss throws. */
const cacheOnly = () => process.env.CACHE_ONLY === "true";

export function cacheKey(key: Record<string, unknown>): string {
  return createHash("sha1").update(JSON.stringify(key)).digest("hex");
}

async function cached<T>(
  key: Record<string, unknown>,
  via: BrightDataVia,
  source: string,
  run: () => Promise<T>,
): Promise<Fetched<T>> {
  const file = path.join(cacheDir(), `${cacheKey(key)}.json`);
  try {
    const hit = JSON.parse(await readFile(file, "utf8")) as CacheEntry<T>;
    return { data: hit.data, cached: true, collectedAt: hit.collectedAt, via: hit.via, source: hit.source };
  } catch {
    // miss
  }
  if (cacheOnly()) throw new Error(`cache miss (CACHE_ONLY): ${source}`);
  if (via !== "http") {
    if (used >= maxRequests()) throw new Error(`Bright Data request cap reached (${maxRequests()})`);
    used++;
  }
  const data = await run();
  const collectedAt = new Date().toISOString();
  await mkdir(cacheDir(), { recursive: true });
  await writeFile(file, JSON.stringify({ key, collectedAt, via, source, data } satisfies CacheEntry<T>));
  return { data, cached: false, collectedAt, via, source };
}

function apiKey(): string {
  const k = process.env.BRIGHTDATA_API_KEY;
  if (!k) throw new Error("BRIGHTDATA_API_KEY is not set");
  return k;
}

async function bdFetch(url: string, init: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Bright Data ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res;
}

/** Web Unlocker: any public page → markdown (default) or raw HTML. */
export async function unlock(url: string, opts: { format?: "markdown" | "html" } = {}): Promise<Fetched<string>> {
  const format = opts.format ?? "markdown";
  const zone = process.env.BRIGHTDATA_UNLOCKER_ZONE ?? "web_unlocker1";
  const key = { kind: "unlock", url, format };
  return cached(key, "unlocker", url, async () => {
    const body: Record<string, unknown> = { zone, url, format: "raw" };
    if (format === "markdown") body.data_format = "markdown";
    return (await bdFetch(`${API}/request`, { method: "POST", body: JSON.stringify(body) })).text();
  });
}

export interface SerpResult { title: string; link: string; description?: string }

/** SERP API: Google results as parsed JSON (organic results only). */
export async function serp(query: string): Promise<Fetched<SerpResult[]>> {
  const zone = process.env.BRIGHTDATA_SERP_ZONE;
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&brd_json=1`;
  return cached({ kind: "serp", query }, "serp", url, async () => {
    if (!zone) throw new Error("BRIGHTDATA_SERP_ZONE is not set");
    const res = await bdFetch(`${API}/request`, { method: "POST", body: JSON.stringify({ zone, url, format: "raw" }) });
    const json = (await res.json()) as { organic?: SerpResult[] };
    return (json.organic ?? []).map((r) => ({ title: r.title, link: r.link, description: r.description }));
  });
}

/** Scraper Studio (DCA) collector: trigger immediately and poll for the result. */
export async function studio<T = unknown>(collectorId: string, inputs: Record<string, unknown>): Promise<Fetched<T>> {
  const source = `studio:${collectorId}`;
  return cached({ kind: "studio", collectorId, inputs }, "studio", source, async () => {
    const trig = await bdFetch(`${API}/dca/trigger_immediate?collector=${encodeURIComponent(collectorId)}`, {
      method: "POST",
      body: JSON.stringify(inputs),
    });
    const { response_id } = (await trig.json()) as { response_id: string };
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const res = await fetch(`${API}/dca/get_result?response_id=${response_id}`, { headers: { Authorization: `Bearer ${apiKey()}` } });
      if (res.status === 202) continue;
      if (!res.ok) throw new Error(`Studio ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return (await res.json()) as T;
    }
    throw new Error(`Studio collector ${collectorId} timed out`);
  });
}

/** Ready-made scraper API (datasets v3, synchronous). Used for e.g. Reddit (F14). */
export async function scraperApi<T = unknown>(datasetId: string, inputs: Record<string, unknown>[]): Promise<Fetched<T>> {
  const source = `dataset:${datasetId}`;
  return cached({ kind: "dataset", datasetId, inputs }, "scraper-api", source, async () => {
    const res = await bdFetch(`${API}/datasets/v3/scrape?dataset_id=${encodeURIComponent(datasetId)}&format=json`, {
      method: "POST",
      body: JSON.stringify({ input: inputs }),
    });
    return (await res.json()) as T;
  });
}

// ---------- plain HTTP (platform fast paths: Sessionize, sched, RainFocus, .ics) ----------

export async function fetchText(url: string, init: RequestInit = {}): Promise<Fetched<string>> {
  const key = { kind: "http", url, method: init.method ?? "GET", body: typeof init.body === "string" ? init.body : null };
  return cached(key, "http", url, async () => {
    const res = await fetch(url, { ...init, headers: { "User-Agent": "Conftellations/0.1 (+public agenda import)", ...(init.headers ?? {}) } });
    if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
    return res.text();
  });
}

export async function fetchJson<T = unknown>(url: string, init: RequestInit = {}): Promise<Fetched<T>> {
  const r = await fetchText(url, init);
  return { ...r, data: JSON.parse(r.data) as T };
}
