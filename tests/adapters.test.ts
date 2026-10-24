import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import * as bd from "@/lib/brightdata";
import { EMBED_DIM, embed, fakeEmbed } from "@/lib/llm";
import { _setLookupForTests } from "@/lib/publicUrl";

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
  // Plain HTTP goes through the (stubbed) global fetch unless a test opts into the real pinned transport.
  bd._setHttpForTests((u, i) => fetch(u, i));
});
afterEach(async () => {
  process.env = { ...env };
  _setLookupForTests(null);
  bd._setHttpForTests(null);
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

  it("refuses private, link-local, and non-http urls before fetching", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(bd.fetchText("http://127.0.0.1/secret")).rejects.toThrow(/not public/);
    await expect(bd.fetchText("http://169.254.169.254/latest")).rejects.toThrow(/not public/);
    await expect(bd.fetchText("file:///etc/passwd")).rejects.toThrow(/not a web URL/);
    await expect(bd.unlock("http://10.0.0.8/")).rejects.toThrow(/not public/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not follow a redirect onto an internal address", async () => {
    const fetchSpy = vi.fn(async (url: string) => {
      if (String(url).includes("127.0.0.1")) return new Response("secret");
      return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/latest" } });
    });
    vi.stubGlobal("fetch", fetchSpy);
    await expect(bd.fetchText("https://public.example/start")).rejects.toThrow(/not public/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toBe("https://public.example/start");
  });

  it("refuses a hostname that resolves to a private address", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    _setLookupForTests(async () => [{ address: "10.0.0.5", family: 4 }]);
    await expect(bd.fetchText("https://rebind.example/admin")).rejects.toThrow(/not public/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("aborts a response larger than the byte cap", async () => {
    const chunk = new Uint8Array(64 * 1024);
    let pulls = 0;
    const stream = new ReadableStream({
      pull(controller) {
        pulls++;
        if (pulls > 40) {
          controller.close();
          return;
        }
        controller.enqueue(chunk);
      },
    });
    const fetchSpy = vi.fn(async () => new Response(stream));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(bd.fetchText("https://big.example/huge")).rejects.toThrow(/too large/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(pulls).toBeLessThan(40);
  });

  it("pins the connection to the vetted DNS answer, so a rebinding host never reaches an internal address", async () => {
    let hits = 0;
    const server: Server = createServer((_req, res) => {
      hits++;
      res.end("internal secret");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address() as AddressInfo;
    try {
      bd._setHttpForTests(null);
      let calls = 0;
      // First answer (the pre-check) is public; the connect-time answer flips to loopback.
      _setLookupForTests(async () => (calls++ === 0 ? [{ address: "93.184.216.34", family: 4 }] : [{ address: "127.0.0.1", family: 4 }]));
      await expect(bd.fetchText(`http://rebind.example:${port}/admin`)).rejects.toThrow(/not public/);
      expect(calls).toBe(2);
      // A lookup failure at connect time fails the request instead of leaving it unchecked.
      _setLookupForTests(async () => {
        throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
      });
      await expect(bd.fetchText(`http://gone.example:${port}/admin`)).rejects.toThrow();
      expect(hits).toBe(0);
    } finally {
      await new Promise((r) => server.close(r));
    }
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
