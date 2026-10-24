import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as addConference } from "@/app/api/conferences/route";
import { GET as getConference } from "@/app/api/conferences/[id]/route";
import { q } from "@/lib/falkor";
import { urlVariants } from "@/lib/agents/scout";
import { extractedToNormalized, type Extracted } from "@/lib/agents/scout/adapters/generic";
import { _setLookupForTests } from "@/lib/publicUrl";
import type { AddConferenceResponse, ConferenceDetail } from "@/lib/types";
import { req } from "./helpers";

const fx = (f: string) => readFileSync(path.join(__dirname, "fixtures", "scout", f), "utf8");

// Fake network at the lib/brightdata boundary: plain HTTP pages by URL, Unlocker markdown by URL. Zero real requests.
const net = vi.hoisted(() => ({
  http: new Map<string, string>(),
  unlock: new Map<string, string>(),
  serp: new Map<string, { title: string; link: string; description?: string }[]>(),
  calls: [] as string[],
  used: 0,
  memo: new Map<string, unknown>(),
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
    serp: async (query: string) => {
      net.calls.push(`serp ${query}`);
      net.used++;
      const hit = [...net.serp.entries()].find(([k]) => query.includes(k));
      const data = hit?.[1] ?? [];
      return { data, cached: true, collectedAt: at, via: "serp", source: `https://www.google.com/search?q=${encodeURIComponent(query)}` };
    },
    // Sponsor extractions are really memoized by key here, so a too-coarse key shows up as one company's profile on another.
    memo: async (key: Record<string, unknown>, source: string, run: () => Promise<unknown>) => {
      const k = JSON.stringify(key);
      if (key.task === "sponsor-enrich" && net.memo.has(k)) return { data: net.memo.get(k), cached: true, collectedAt: at, via: "memo", source };
      const data = await run();
      if (key.task === "sponsor-enrich") net.memo.set(k, data);
      return { data, cached: false, collectedAt: at, via: "memo", source };
    },
    requestsUsed: () => net.used,
  };
});

const blankConf = { region: "", country: "", timezone: "" };
const generic = {
  conference: { name: "Graph Summit 2026", startDate: "2026-12-03", endDate: "2026-12-03", city: "London", ...blankConf },
  sessions: [
    { title: "Graphs for agent memory", abstract: "How agents remember.", kind: "talk", start: "2026-12-03T10:00:00+00:00", end: "2026-12-03T10:30:00+00:00", room: "Main", url: "https://graphsummit.example/agenda#memory", speakers: ["Ada Graph"], topics: ["agent memory"] },
    { title: "Untimed panel", abstract: "", kind: "panel", start: "", end: "", room: "", url: "", speakers: [], topics: [] },
  ],
  people: [{ name: "Ada Graph", title: "CTO", company: "Nodely", bio: "Builds graph systems.", links: ["https://nodely.example/ada"] }],
  companies: [{ name: "Nodely", website: "https://nodely.example", description: "Graph hosting.", sponsorTier: "Gold", booth: "B12", hall: "West", topics: ["graph databases"] }],
};
const spanDays = {
  conference: { name: "Span Days 2026", startDate: "2026-12-01", endDate: "", city: "London", ...blankConf },
  sessions: [
    { title: "Opening day", abstract: "", kind: "keynote", start: "2026-12-01T10:00:00+00:00", end: "2026-12-01T11:00:00+00:00", room: "", url: "", speakers: [], topics: ["opening"] },
    { title: "Closing day", abstract: "", kind: "talk", start: "2026-12-03T15:00:00+00:00", end: "2026-12-03T16:00:00+00:00", room: "", url: "", speakers: [], topics: ["closing"] },
  ],
  people: [],
  companies: [],
};
const nameOnly = {
  conference: { name: "Name Only Expo 2026", startDate: "2026-12-04", endDate: "2026-12-04", city: "London", ...blankConf },
  sessions: [
    { title: "Welcome", abstract: "", kind: "keynote", start: "2026-12-04T09:00:00+00:00", end: "2026-12-04T09:30:00+00:00", room: "", url: "", speakers: [], topics: ["welcome"] },
  ],
  people: [],
  companies: [
    { name: "Found Co", website: "", description: "", sponsorTier: "Gold", booth: "", hall: "", topics: [] },
    { name: "Other Co", website: "", description: "", sponsorTier: "", booth: "", hall: "", topics: [] },
    { name: "Ghost Co", website: "", description: "", sponsorTier: "", booth: "", hall: "", topics: [] },
    { name: "Loopback Labs", website: "http://127.0.0.1/", description: "", sponsorTier: "", booth: "", hall: "", topics: [] },
  ],
};

const rescue = {
  conference: { name: "Rescue Expo 2026", startDate: "2026-12-05", endDate: "2026-12-05", city: "London", ...blankConf },
  sessions: [
    { title: "Opening", abstract: "", kind: "keynote", start: "2026-12-05T09:00:00+00:00", end: "2026-12-05T09:30:00+00:00", room: "", url: "", speakers: [], topics: ["opening"] },
  ],
  people: [],
  companies: [
    { name: "Rescue Co", website: "", description: "", sponsorTier: "Gold", booth: "", hall: "", topics: [] },
    { name: "Twin Labs", website: "", description: "", sponsorTier: "Gold", booth: "", hall: "", topics: [] },
    { name: "Twin Labs Cloud", website: "", description: "", sponsorTier: "Gold", booth: "", hall: "", topics: [] },
    { name: "Stale Co", website: "", description: "", sponsorTier: "Gold", booth: "", hall: "", topics: [] },
  ],
};

vi.mock("@/lib/llm", async (orig) =>
  (await import("./fakes")).fakeLlm(await orig(), (...args: unknown[]) => {
    const [, , user, name] = args as [unknown, string, string, string];
    if (name === "sponsor") {
      const company = user.match(/^Company: (.+)$/m)?.[1] ?? "?";
      return { known: true, description: `${company} builds cloud infrastructure for platform teams.`, topics: ["Kubernetes Security", "observability"] };
    }
    if (name === "conference") {
      if (user.includes("SPAN DAYS")) return spanDays;
      if (user.includes("NAME ONLY SPONSORS")) return nameOnly;
      if (user.includes("RESCUE EXPO")) return rescue;
      if (user.includes("CAP PAGES")) return { ...generic, conference: { ...generic.conference, name: "Cap Pages 2026" } };
      return generic;
    }
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
  net.unlock.set("https://span.example/", "# SPAN DAYS\n");
  net.unlock.set("https://nameonly.example/", "# NAME ONLY SPONSORS\n");
  net.unlock.set("https://found.example/", `# Found Co\n${"We build cloud infrastructure for platform teams. ".repeat(12)}`);
  net.serp.set("Found Co", [{ title: "Found Co", link: "https://found.example/", description: "Found builds storage." }]);
  net.serp.set("Other Co", [
    { title: "Other Co", link: "https://en.wikipedia.org/wiki/Other_Co", description: "directory" },
    { title: "Found Co", link: "https://found.example/", description: "different company" },
  ]);
  net.unlock.set("https://rescueexpo.example:8443/expo", "# RESCUE EXPO\n");
  for (const site of ["https://rescue.example/", "https://twinlabs.example/", "https://staleco.example/"]) net.unlock.set(site, `# ${site}\n${"We build cloud infrastructure for platform teams. ".repeat(12)}`);
  net.serp.set("Rescue Co", [
    { title: "Rescue Co (old)", link: "https://rescue-internal.example/", description: "resolves to a private address" },
    { title: "Rescue Co", link: "https://rescue.example/", description: "public" },
  ]);
  net.serp.set("Twin Labs", [{ title: "Twin Labs", link: "https://twinlabs.example/", description: "one page for both" }]);
  net.serp.set("Stale Co", [{ title: "Stale Co", link: "https://staleco.example/", description: "public now" }]);
  net.serp.set("Ghost Co", [{ title: "internal", link: "http://10.1.1.1/secret", description: "no" }]);
  const capLinks = Array.from({ length: 8 }, (_, i) => `[a](https://cap.example/agenda/${"p".repeat(i + 1)})`).join("\n");
  net.unlock.set("https://cap.example/start", `# CAP PAGES\n${capLinks}\n`);
  for (let i = 1; i <= 8; i++) net.unlock.set(`https://cap.example/agenda/${"p".repeat(i)}`, "session list");
  net.http.set("https://sponsors26.sched.com/", `<h3 class="sponsors-logos--header">Gold</h3><a href="https://schedco.example/" title="Go to Sched Co"><img alt="Sched Co logo" /></a>`);
  net.http.set("https://sponsors26.sched.com/all.ics", [
    "BEGIN:VCALENDAR", "X-WR-CALNAME:sponsors26", "BEGIN:VEVENT", "DTSTART:20261203T170000Z", "DTEND:20261203T173000Z",
    "SUMMARY:Sponsor keynote", "CATEGORIES:KEYNOTES", "LOCATION:Hall A\\, Austin\\, TX\\, USA", "UID:sp1", "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n"));
  net.http.set("https://query26.sched.com/all.ics", [
    "BEGIN:VCALENDAR", "X-WR-CALNAME:query26", "BEGIN:VEVENT", "DTSTART:20261203T170000Z", "DTEND:20261203T173000Z",
    "SUMMARY:Query keynote", "CATEGORIES:KEYNOTES", "LOCATION:Hall A\\, Austin\\, TX\\, USA", "UID:q1", "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n"));
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
    expect(d.sessions[0]).toMatchObject({ title: "Graphs for agent memory", start: "2026-12-03T10:00:00+00:00", end: "2026-12-03T10:30:00+00:00", url: "https://graphsummit.example/agenda#memory" });
    expect(d.sessions[0].speakers[0]).toMatchObject({ id: "ada-graph@nodely", company: "Nodely" });
    expect(d.booths).toEqual([expect.objectContaining({ label: "B12", hall: "West", companyId: "nodely.example" })]);
    expect(d.sponsors?.find((s) => s.name === "Nodely")?.topics).toContain("graph databases");
    const [person] = await q<{ bio: string | null; links: string[] | null }>(`MATCH (p:Person {id:'ada-graph@nodely'}) RETURN p.bio AS bio, p.links AS links`);
    expect(person.bio).toBe("Builds graph systems.");
    expect(person.links).toContain("https://nodely.example/ada");
  });

  it("caps generic follow-up pages at five even when SCOUT_EXTRA_PAGES is higher", async () => {
    const prev = process.env.SCOUT_EXTRA_PAGES;
    process.env.SCOUT_EXTRA_PAGES = "20";
    try {
      const { status, body } = await post({ url: "https://cap.example/start" });
      expect(status, body.error).toBe(200);
      const followed = net.calls.filter((c) => c.startsWith("unlock https://cap.example/agenda/"));
      expect(followed).toHaveLength(5);
      expect(net.calls.filter((c) => c.startsWith("unlock https://cap.example/"))).toHaveLength(6);
    } finally {
      if (prev === undefined) delete process.env.SCOUT_EXTRA_PAGES;
      else process.env.SCOUT_EXTRA_PAGES = prev;
    }
  });

  it("uses the last session day when a generic import has no end date", async () => {
    const { status, body } = await post({ url: "https://span.example/" });
    expect(status, body.error).toBe(200);
    expect(body.conference).toMatchObject({ id: "span-days-2026", startDate: "2026-12-01", endDate: "2026-12-03" });
  });

  it("searches name-only sponsors and stores a skip reason when search has no public url", async () => {
    const { status, body } = await post({ url: "https://nameonly.example/" });
    expect(status, body.error).toBe(200);
    expect(net.calls.some((c) => c.startsWith("serp ") && c.includes("Found Co"))).toBe(true);
    expect(net.calls.some((c) => c.startsWith("serp ") && c.includes("Ghost Co"))).toBe(true);
    expect(net.calls).toContain("unlock https://found.example/");
    expect(net.calls.some((c) => c.includes("127.0.0.1") || c.includes("10.1.1.1") || c.includes("wikipedia.org"))).toBe(false);
    const { body: d } = await detail("name-only-expo-2026");
    expect(d.sponsors?.find((s) => s.name === "Found Co")).toMatchObject({ id: "found-co", website: "https://found.example/", via: "unlocker", description: "Found Co builds cloud infrastructure for platform teams." });
    const rows = await q<{ id: string; skip: string | null; website: string | null }>(
      `MATCH (co:Company)-[:SPONSORS]->(:Conference {id:'name-only-expo-2026'}) RETURN co.id AS id, co.enrichSkip AS skip, co.website AS website`,
    );
    expect(rows.map((r) => r.id)).not.toContain("found.example");
    expect(rows.find((r) => r.id === "other-co")).toMatchObject({ skip: "no website; search returned no result for this company", website: null });
    expect(rows.find((r) => r.id === "ghost-co")).toMatchObject({ skip: "no website; search returned no public url", website: null });
    expect(rows.find((r) => r.id === "loopback-labs")?.skip).toBe("website is not a public http(s) url");
    expect(rows.find((r) => r.id === "loopback-labs")?.website ?? null).toBeNull();
  });

  it("tries later search hits, keys searched profiles per company, clears stale skips, and accepts host:port input", async () => {
    await q(`MERGE (co:Company {id:'stale-co'}) SET co.name = 'Stale Co', co.enrichSkip = 'website host is not public'`);
    _setLookupForTests(async (host) => (host === "rescue-internal.example" ? [{ address: "10.0.0.9", family: 4 }] : [{ address: "93.184.216.34", family: 4 }]));
    try {
      const { status, body } = await post({ url: "rescueexpo.example:8443/expo" });
      expect(status, body.error).toBe(200);
      expect(body.conference.id).toBe("rescue-expo-2026");
    } finally {
      _setLookupForTests(null);
    }
    expect(net.calls).not.toContain("unlock https://rescue-internal.example/");
    const rows = await q<{ id: string; skip: string | null; website: string | null; description: string | null }>(
      `MATCH (co:Company)-[:SPONSORS]->(:Conference {id:'rescue-expo-2026'}) RETURN co.id AS id, co.enrichSkip AS skip, co.website AS website, co.description AS description`,
    );
    const row = (id: string) => rows.find((r) => r.id === id);
    expect(row("rescue-co")).toMatchObject({ skip: null, website: "https://rescue.example/", description: "Rescue Co builds cloud infrastructure for platform teams." });
    expect(row("twin-labs")?.description).toBe("Twin Labs builds cloud infrastructure for platform teams.");
    expect(row("twin-labs-cloud")?.description).toBe("Twin Labs Cloud builds cloud infrastructure for platform teams.");
    expect(row("stale-co")).toMatchObject({ skip: null, website: "https://staleco.example/" });
  });

  it("reads sponsors from a direct sched.com page", async () => {
    const { status, body } = await post({ url: "https://sponsors26.sched.com/" });
    expect(status, body.error).toBe(200);
    expect(body.counts.companies).toBe(1);
    const { body: d } = await detail(body.conference.id);
    expect(d.sponsors?.map((s) => s.name)).toEqual(["Sched Co"]);
  });

  it("treats slash and non-slash query urls as the same import", async () => {
    expect(urlVariants("https://query26.sched.com/list?year=2026")).toContain("https://query26.sched.com/list/?year=2026");
    expect(urlVariants("https://query26.sched.com/list/?year=2026")).toContain("https://query26.sched.com/list?year=2026");
    expect(urlVariants("https://query26.sched.com/list?year=2026").some((u) => u.includes("year=2026/"))).toBe(false);
    const first = await post({ url: "https://query26.sched.com/list?year=2026" });
    expect(first.status, first.body.error).toBe(200);
    expect(first.body.cached).toBe(false);
    net.calls.length = 0;
    const second = await post({ url: "https://query26.sched.com/list/?year=2026" });
    expect(second.status, second.body.error).toBe(200);
    expect(second.body).toMatchObject({ cached: true, conference: { id: first.body.conference.id } });
    expect(net.calls).toEqual([]);
  });

  it("rejects internal and non-http urls before any fetch", async () => {
    const urls = [
      "http://127.0.0.1/secret",
      "http://localhost/admin",
      "http://10.1.2.3/x",
      "http://192.168.1.9/",
      "http://172.16.0.5/",
      "http://169.254.169.254/latest",
      "http://[::1]/",
      "http://[fd00::1]/",
      "http://[fe80::1]/",
      "http://0.0.0.0/",
      "http://metadata.google.internal/computeMetadata/v1/",
      "http://printer.local/",
      "file:///etc/passwd",
      "ftp://example.com/feed",
    ];
    for (const url of urls) {
      net.calls.length = 0;
      const { status, body } = await post({ url });
      expect(status, `${url} ${body.error}`).toBe(422);
      expect(net.calls, url).toEqual([]);
    }
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

describe("generic extraction -> normalized", () => {
  const base = (sessions: Extracted["sessions"], companies: Extracted["companies"] = []) =>
    ({ conference: { name: "Unit Conf", startDate: "2026-12-03", endDate: "2026-12-04", city: "", region: "", country: "", timezone: "" }, sessions, people: [], companies }) as unknown as Extracted;
  const session = (start: string, end: string) => ({ title: "Late show", abstract: "", kind: "talk", start, end, room: "", url: "", speakers: [], topics: [] }) as unknown as Extracted["sessions"][number];

  it("rolls a time-only end past midnight onto the next venue-local day", () => {
    const n = extractedToNormalized(base([session("2026-12-03T23:30", "01:00")]), { id: "u", url: "https://u.example/", timeZone: "Europe/London", collectedAt: "x" });
    expect(n.sessions[0]).toMatchObject({ start: "2026-12-03T23:30:00+00:00", end: "2026-12-04T01:00:00+00:00" });
  });

  it("puts a time-only end on the venue-local date of an offset-bearing start", () => {
    const n = extractedToNormalized(base([session("2026-12-04T01:30:00+09:00", "09:15")]), { id: "u", url: "https://u.example/", timeZone: "America/Los_Angeles", collectedAt: "x" });
    expect(n.sessions[0].end).toBe("2026-12-03T09:15:00-08:00");
    expect(Date.parse(n.sessions[0].end) - Date.parse(n.sessions[0].start)).toBe(45 * 60_000);
  });

  it("does not invent a booth from a hall alone", () => {
    const companies = [
      { name: "Hall Only", website: "", description: "", sponsorTier: "", booth: "", hall: "North", topics: [] },
      { name: "Booth Co", website: "", description: "", sponsorTier: "", booth: "B7", hall: "North", topics: [] },
    ] as unknown as Extracted["companies"];
    const n = extractedToNormalized(base([], companies), { id: "u", url: "https://u.example/", timeZone: "Europe/London", collectedAt: "x" });
    expect(n.companies.find((c) => c.name === "Hall Only")?.booth).toBeUndefined();
    expect(n.companies.find((c) => c.name === "Booth Co")?.booth).toEqual({ label: "B7", hall: "North" });
  });
});
