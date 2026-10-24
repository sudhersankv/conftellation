import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as addConference } from "@/app/api/conferences/route";
import { GET as getConference } from "@/app/api/conferences/[id]/route";
import type { AddConferenceResponse, ConferenceDetail } from "@/lib/types";
import { req } from "./helpers";

const fx = (f: string) => readFileSync(path.join(__dirname, "fixtures", "scout", f), "utf8");

// Fake network at the lib/brightdata boundary: plain HTTP pages by URL, Unlocker markdown by URL. Zero real requests.
const net = vi.hoisted(() => ({
  http: new Map<string, string>(),
  unlock: new Map<string, string>(),
  calls: [] as string[],
  used: 0,
}));

vi.mock("@/lib/brightdata", () => {
  const at = "2026-10-24T18:00:00.000Z";
  const fetchText = async (url: string, init?: RequestInit) => {
    const key = typeof init?.body === "string" ? `${url} ${init.body}` : url;
    net.calls.push(`http ${key}`);
    const data = net.http.get(key);
    if (data === undefined) throw new Error(`GET ${url} → 404`);
    return { data, cached: true, collectedAt: at, via: "http", source: url };
  };
  return {
    fetchText,
    fetchJson: async (url: string, init?: RequestInit) => {
      const r = await fetchText(url, init);
      return { ...r, data: JSON.parse(r.data) };
    },
    unlock: async (url: string) => {
      net.calls.push(`unlock ${url}`);
      net.used++;
      const data = net.unlock.get(url);
      if (data === undefined) throw new Error(`Bright Data 502: ${url}`);
      return { data, cached: false, collectedAt: at, via: "unlocker", source: url };
    },
    serp: async () => ({ data: [], cached: true, collectedAt: at, via: "serp", source: "" }),
    memo: async (_key: unknown, source: string, run: () => Promise<unknown>) => ({ data: await run(), cached: false, collectedAt: at, via: "memo", source }),
    requestsUsed: () => net.used,
  };
});

const generic = {
  conference: { name: "Graph Summit 2026", startDate: "2026-12-03", endDate: "2026-12-03", city: "London", region: null, country: "UK", timezone: "Europe/London" },
  sessions: [
    { title: "Graphs for agent memory", abstract: "How agents remember.", kind: "talk", date: "2026-12-03", start: "10:00", end: "10:30", room: "Main", speakers: [{ name: "Ada Graph", title: "CTO", company: "Nodely" }], topics: ["agent memory"] },
    { title: "Untimed panel", abstract: null, kind: "panel", date: null, start: null, end: null, room: null, speakers: [], topics: [] },
  ],
  sponsors: [{ name: "Nodely", website: "https://nodely.example", tier: "Gold", description: "Graph hosting." }],
};

vi.mock("@/lib/llm", async (orig) =>
  (await import("./fakes")).fakeLlm(await orig(), (...args: unknown[]) => {
    const [, , user, name] = args as [unknown, string, string, string];
    if (name === "sponsor") {
      const company = user.match(/^Company: (.+)$/m)?.[1] ?? "?";
      return { known: true, description: `${company} builds cloud infrastructure for platform teams.`, topics: ["Kubernetes Security", "observability"] };
    }
    if (name === "conference") return generic;
    if (name === "timezone") return { timezone: "America/Denver" };
    throw new Error(`unexpected structured() call ${name}`);
  }),
);

const HOME = "https://events.example.org/kccnna/";
const KCC_ID = "kubecon-cloudnativecon-north-america-2026";

const post = async (body: unknown) => {
  const res = await addConference(req("/api/conferences", body));
  return { status: res.status, body: (await res.json()) as AddConferenceResponse & { error?: string } };
};
const detail = async (id: string) => {
  const res = await getConference(req(`/api/conferences/${id}`), { params: { id } });
  return { status: res.status, body: (await res.json()) as ConferenceDetail };
};

beforeAll(async () => {
  if (!process.env.FALKORDB_GRAPH?.endsWith("_test")) throw new Error("refusing to run on a non-test graph");
  const { wipe } = await import("@/seed/demo");
  await wipe();
  net.http.set(HOME, fx("home.html"));
  net.http.set("https://events.example.org/kccnna/program/schedule/", fx("schedule.html"));
  net.http.set("https://events.example.org/kccnna/sponsor-list/", fx("sponsors.html"));
  net.http.set("https://sessionize.com/api/v2/svi82w6c/view/All", fx("sessionize.json"));
  for (const site of ["https://www.anthropic.com/", "https://aws.amazon.com/", "https://www.datadoghq.com/"]) net.unlock.set(site, `# ${site}\n${"We build cloud infrastructure for platform teams. ".repeat(12)}`);
  net.unlock.set("https://graphsummit.example/", "# Graph Summit 2026\n[Agenda](https://graphsummit.example/agenda)\n");
  net.unlock.set("https://graphsummit.example/agenda", "## 10:00 Graphs for agent memory");
  net.http.set("https://demo26.sched.com/all.ics", [
    "BEGIN:VCALENDAR", "X-WR-CALNAME:demo26", "BEGIN:VEVENT", "DTSTART:20261203T170000Z", "DTEND:20261203T173000Z",
    "SUMMARY:Keynote: Opening", "CATEGORIES:KEYNOTES", "LOCATION:Hall A\\, Austin\\, TX\\, USA", "UID:abc123", "END:VEVENT",
    "BEGIN:VEVENT", "DTSTART:20261203T120000Z", "DTEND:20261203T130000Z", "SUMMARY:Badge pick-up", "CATEGORIES:REGISTRATION", "UID:reg1", "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n"));
}, 60_000);

beforeEach(() => {
  net.calls.length = 0;
  net.used = 0;
});

describe("POST /api/conferences (Sessionize + sponsor enrichment)", () => {
  it("imports a conference home page via its Sessionize schedule and enriches top sponsors", async () => {
    const { status, body } = await post({ url: HOME });
    expect(status, body.error).toBe(200);
    expect(body.cached).toBe(false);
    expect(body.conference).toMatchObject({ id: KCC_ID, name: "KubeCon + CloudNativeCon North America", startDate: "2026-11-09", endDate: "2026-11-12", city: "Salt Lake City", timezone: "America/Denver", via: "sessionize" });
    expect(body.counts.sessions).toBe(8); // the break is dropped
    expect(body.counts.people).toBeGreaterThan(5);
    expect(body.counts.companies).toBe(4); // media partners dropped
    // only same-event links are followed, the dead code is tried before the real one, enrichment = 1 Unlocker call per site
    expect(net.calls).not.toContain("http https://events.example.org/other-event/program/schedule/");
    expect(net.calls.filter((c) => c.startsWith("unlock"))).toHaveLength(4);
  });

  it("serves GET /api/conferences/:id with venue-local times, speakers' companies and enriched sponsors", async () => {
    const { status, body } = await detail(KCC_ID);
    expect(status).toBe(200);
    expect(body.conference.timezone).toBe("America/Denver");
    expect(body.sessions).toHaveLength(8);
    for (const s of body.sessions) {
      expect(s.start).toMatch(/^2026-11-10T\d{2}:\d{2}:00-07:00$/);
      expect(s).toMatchObject({ conferenceId: KCC_ID, via: "sessionize" });
    }
    expect(body.sessions[0].start <= body.sessions[1].start).toBe(true);
    expect(body.sessions.some((s) => s.speakers.some((p) => p.company))).toBe(true);
    const sponsors = body.sponsors!;
    expect(sponsors.map((s) => s.name)).toEqual(["Anthropic", "AWS", "Datadog", "Tiny Co"]);
    expect(sponsors[0]).toMatchObject({ id: "anthropic.com", sponsorTier: "DIAMOND", via: "unlocker", source: "https://www.anthropic.com/", description: "Anthropic builds cloud infrastructure for platform teams." });
    expect(sponsors[0].topics).toContain("observability");
    expect(sponsors[3]).toMatchObject({ name: "Tiny Co", via: "web", source: "https://events.example.org/kccnna/sponsor-list/" });
    expect(sponsors[3].description).toBeUndefined();
  });

  it("returns cached:true for an already-imported URL without fetching anything", async () => {
    const t0 = Date.now();
    const { status, body } = await post({ url: "https://events.example.org/kccnna" });
    expect(status).toBe(200);
    expect(body).toMatchObject({ cached: true, conference: { id: KCC_ID }, counts: { sessions: 8, companies: 4 } });
    expect(net.calls).toEqual([]);
    expect(Date.now() - t0).toBeLessThan(3000);
  });
});

describe("POST /api/conferences (other paths)", () => {
  it("any site: Unlocker markdown + extra agenda page → LLM extraction, untimed items dropped", async () => {
    const { status, body } = await post({ url: "https://graphsummit.example" });
    expect(status, body.error).toBe(200);
    expect(body.conference).toMatchObject({ id: "graph-summit-2026", timezone: "Europe/London", via: "unlocker" });
    expect(body.counts).toMatchObject({ sessions: 1, people: 1 });
    expect(net.calls).toContain("unlock https://graphsummit.example/agenda");
    const { body: d } = await detail("graph-summit-2026");
    expect(d.sessions[0]).toMatchObject({ title: "Graphs for agent memory", start: "2026-12-03T10:00:00+00:00", end: "2026-12-03T10:30:00+00:00" });
    expect(d.sessions[0].speakers[0]).toMatchObject({ id: "ada-graph@nodely", company: "Nodely" });
  });

  it("sched.com: reads the public .ics feed in the venue timezone", async () => {
    const { status, body } = await post({ url: "https://demo26.sched.com/" });
    expect(status, body.error).toBe(200);
    expect(body.conference).toMatchObject({ timezone: "America/Chicago", via: "ics", startDate: "2026-12-03" });
    expect(body.counts.sessions).toBe(1);
    const { body: d } = await detail(body.conference.id);
    expect(d.sessions[0]).toMatchObject({ kind: "keynote", start: "2026-12-03T11:00:00-06:00", room: "Hall A" });
  });

  it("RainFocus (known site): pages the public catalog API, keeps published sessions and sponsors", async () => {
    const rf = "https://events.rainfocus.com/api/search";
    const session = (n: number, published = true) => ({
      sessionID: `S${n}`, code: `C${n}`, title: `Session ${n}`, type: "Breakout session", published,
      times: [{ utcStartTime: "2026/10/28 17:00:00", utcEndTime: "2026/10/28 17:30:00", room: "Room 1" }],
      participants: [{ fullName: "Mona Lisa", jobTitle: "Engineer", companyName: "GitHub", session: [{ sessionID: `S${n}`, published: "true" }] }],
      attributevalues: [{ attribute_id: "Topic", value: "AI: Agents" }],
    });
    net.http.set(`${rf} type=session&size=50&from=0`, JSON.stringify({ sectionList: [{ items: [session(1), session(2, false)] }] }));
    net.http.set(`${rf} type=exhibitor&size=50&from=0`, JSON.stringify({ sectionList: [{ items: [{ name: "Octo Corp", description: "Octo things.", externalLink: "https://octo.example" }] }] }));
    const { status, body } = await post({ url: "https://githubuniverse.com/" });
    expect(status, body.error).toBe(200);
    expect(body.conference).toMatchObject({ id: "github-universe-2026", timezone: "America/Los_Angeles", via: "rainfocus" });
    expect(body.counts).toMatchObject({ sessions: 1, people: 1, companies: 1 });
    const { body: d } = await detail("github-universe-2026");
    expect(d.sessions[0]).toMatchObject({ id: "ghu26-c1", start: "2026-10-28T10:00:00-07:00", topics: ["agents"] });
  });

  it("rejects bad input with JSON errors", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ url: "not a url" })).status).toBe(422);
    const nf = await getConference(req("/api/conferences/nope"), { params: { id: "nope" } });
    expect(nf.status).toBe(404);
    expect(await nf.json()).toHaveProperty("error");
  });
});
