import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as bd from "@/lib/brightdata";
import { EMBED_DIM, embed, fakeEmbed } from "@/lib/llm";

let dir: string;
const env = { ...process.env };

async function prime(key: Record<string, unknown>, data: unknown, via = "unlocker") {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${bd.cacheKey(key)}.json`), JSON.stringify({ key, collectedAt: "2026-10-24T10:00:00Z", via, source: "x", data }));
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "bd-cache-"));
  process.env.BRIGHTDATA_CACHE_DIR = dir;
  bd.resetRequestCount();
});
afterEach(async () => {
  process.env = { ...env };
  vi.unstubAllGlobals();
  await rm(dir, { recursive: true, force: true });
});

describe("brightdata adapter", () => {
  it("serves every call from a primed cache with zero network calls", async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error("network not allowed")));
    vi.stubGlobal("fetch", fetchSpy);
    await prime({ kind: "unlock", url: "https://conf.example/agenda", format: "markdown" }, "# Agenda");
    await prime({ kind: "serp", query: "Acme Trace" }, [{ title: "Acme", link: "https://acme.dev" }], "serp");
    await prime({ kind: "studio", collectorId: "c1", inputs: { url: "u" } }, [{ title: "t" }], "studio");
    await prime({ kind: "dataset", datasetId: "d1", inputs: [{ q: 1 }] }, [{ post: "p" }], "scraper-api");
    await prime({ kind: "http", url: "https://sessionize.com/api/v2/x/view/All", method: "GET", body: null }, '{"sessions":[]}', "http");

    const u = await bd.unlock("https://conf.example/agenda");
    expect(u).toMatchObject({ data: "# Agenda", cached: true, collectedAt: "2026-10-24T10:00:00Z" });
    expect((await bd.serp("Acme Trace")).data[0].link).toBe("https://acme.dev");
    expect((await bd.studio("c1", { url: "u" })).data).toEqual([{ title: "t" }]);
    expect((await bd.scraperApi("d1", [{ q: 1 }])).data).toEqual([{ post: "p" }]);
    expect((await bd.fetchJson("https://sessionize.com/api/v2/x/view/All")).data).toEqual({ sessions: [] });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(bd.requestsUsed()).toBe(0);
  });

  it("caches a miss and enforces the request cap", async () => {
    process.env.BRIGHTDATA_API_KEY = "test-key";
    process.env.BRIGHTDATA_MAX_REQUESTS = "1";
    const fetchSpy = vi.fn(() => Promise.resolve(new Response("# Page")));
    vi.stubGlobal("fetch", fetchSpy);

    const first = await bd.unlock("https://a.example");
    expect(first.cached).toBe(false);
    const again = await bd.unlock("https://a.example");
    expect(again.cached).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await expect(bd.unlock("https://b.example")).rejects.toThrow(/cap/);
  });

  it("CACHE_ONLY never touches the network", async () => {
    process.env.CACHE_ONLY = "true";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(bd.fetchText("https://nope.example")).rejects.toThrow(/cache miss/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("llm fake embedder", () => {
  it("is deterministic, unit-length and lexically meaningful", async () => {
    delete process.env.OPENAI_API_KEY;
    const [a, b, c] = await embed(["agent tracing and observability", "Tracing multi-agent systems end to end", "Running inference at scale"]);
    expect(a).toHaveLength(EMBED_DIM);
    expect(fakeEmbed("agent tracing and observability")).toEqual(a);
    const dot = (x: number[], y: number[]) => x.reduce((s, v, i) => s + v * y[i], 0);
    expect(dot(a, a)).toBeCloseTo(1, 5);
    expect(dot(a, b)).toBeGreaterThan(dot(a, c));
  });
});
