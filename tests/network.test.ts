import { beforeAll, describe, expect, it, vi } from "vitest";
import { GET as getIntros } from "@/app/api/users/[id]/intros/route";
import { GET as getNetwork } from "@/app/api/users/[id]/network/route";
import { POST as postMeet } from "@/app/api/users/[id]/meet/route";
import { POST as postRespond } from "@/app/api/meets/[id]/respond/route";
import { GET as getPerson } from "@/app/api/people/[id]/route";
import { GET as getSearch } from "@/app/api/search/route";
import { GET as getPlan } from "@/app/api/users/[id]/plan/route";
import { freeSlots } from "@/lib/agents/network";
import { runPlanner } from "@/lib/agents/planner";
import { q } from "@/lib/falkor";
import { fakeEmbed } from "@/lib/llm";
import { introPaths } from "@/lib/queries/brief";
import { closeMeet, meetById, plannedMeets, setPlannedMeets, warmIntros } from "@/lib/queries/network";
import type { IntrosResponse, MeetRequest, NetworkResponse, PersonDetail, PlanResponse, SearchResponse } from "@/lib/types";
import { req, seedOnce } from "./helpers";

vi.mock("@/lib/llm", async (orig) => (await import("./fakes")).fakeLlm(await orig()));
vi.mock("@/lib/brightdata", () => ({}));

beforeAll(() => seedOnce(), 180_000);

const NOW = "2026-10-24T12:30:00-07:00";
const T = (hhmm: string) => `2026-10-24T${hhmm}:00-07:00`;
const enc = encodeURIComponent;
const body = async <X>(res: Response) => ({ status: res.status, body: (await res.json()) as X });
const intros = (u: string) => getIntros(req(`/api/users/${u}/intros?confId=ptc-2026`), { params: { id: u } }).then(body<IntrosResponse>);
const network = (u: string) => getNetwork(req(`/api/users/${u}/network?confId=ptc-2026&now=${enc(NOW)}`), { params: { id: u } }).then(body<NetworkResponse>);
const meet = (u: string, b: unknown) => postMeet(req(`/api/users/${u}/meet`, b), { params: { id: u } }).then(body<MeetRequest>);
const respond = (id: string, b: object, as: string) => postRespond(req(`/api/meets/${id}/respond?now=${enc(NOW)}`, { ...b, userId: as }), { params: { id } }).then(body<MeetRequest>);
const plan = (u: string) => getPlan(req(`/api/users/${u}/plan?confId=ptc-2026&now=${enc(NOW)}`), { params: { id: u } }).then(body<PlanResponse>);
const person = (id: string, qs = "") => getPerson(req(`/api/people/${enc(id)}${qs}`), { params: { id: enc(id) } }).then(body<PersonDetail>);
const search = (qq: string) => getSearch(req(`/api/search?confId=ptc-2026&q=${enc(qq)}`)).then(body<SearchResponse>);

describe("GET /api/users/:id/intros", () => {
  it("warm intro to Priya via Emily, and Jake met before; paths are real", async () => {
    const { status, body: b } = await intros("sam");
    expect(status).toBe(200);
    const warm = b.intros.find((i) => i.kind === "warm_intro" && i.person.id === "priya-nair@acmetrace")!;
    expect(warm).toBeTruthy();
    expect(warm.via?.id).toBe("emily-chen@tensorgrid");
    const ids = warm.path.nodes.map((n) => n.id);
    expect(ids).toEqual(expect.arrayContaining(["sam", "emily-chen@tensorgrid", "emily", "priya-nair@acmetrace"]));
    for (const e of warm.path.edges) expect(ids.includes(e.from) && ids.includes(e.to)).toBe(true);
    const jake = b.intros.find((i) => i.kind === "met_before" && i.person.id === "jake-morales@falkordb")!;
    expect(jake.text).toMatch(/AI Engineer Summit in June/);
    expect(jake.path.edges[0]).toMatchObject({ from: "sam", to: "jake-morales@falkordb", type: "MET" });
    for (const i of b.intros) expect(i.text.length).toBeLessThanOrEqual(110);
  });

  it("unknown user → 200 empty", async () => {
    expect(await intros("nobody")).toEqual({ status: 200, body: { intros: [] } });
  });
});

describe("GET /api/users/:id/network", () => {
  it("lists overlapping users with personId, shared items, topics, free slots and the seeded pending meet", async () => {
    await plan("sam");
    const t0 = Date.now();
    const { status, body: b } = await network("sam");
    console.log(`network: ${Date.now() - t0} ms`);
    expect(status).toBe(200);
    const emily = b.users.find((u) => u.user.id === "emily")!;
    expect(emily.user.personId).toBe("emily-chen@tensorgrid");
    expect(emily.shared.map((s) => s.id)).toContain("s-graphrag");
    expect(emily.overlap).toBe(emily.shared.length);
    for (const s of emily.freeSlots) expect(s.from >= NOW && s.to > s.from).toBe(true);
    for (const u of b.users) expect(u.user.personId).toBeTruthy();
    expect(b.outgoing.find((m) => m.id === "meet-1")).toMatchObject({ toUserId: "emily", status: "pending", proposal: { sessionId: "s-infra" } });
    expect((await network("emily")).body.incoming.map((m) => m.id)).toContain("meet-1");
    expect(await network("nobody")).toEqual({ status: 200, body: { users: [], incoming: [], outgoing: [] } });
  });

  it("freeSlots finds mutual gaps after now", () => {
    const slots = freeSlots({
      day: { from: T("10:00"), to: T("18:00") }, now: T("12:30"), windows: [{ from: null, to: T("15:00") }],
      busy: [{ from: T("12:30"), to: T("13:30") }, { from: T("13:40"), to: T("14:30") }],
    });
    expect(slots).toEqual([{ from: T("14:30"), to: T("15:00") }]);
  });

  it("freeSlots stays inside both availability windows", () => {
    const slots = freeSlots({
      day: { from: T("10:00"), to: T("18:00") }, now: T("12:30"),
      windows: [{ from: T("13:00"), to: T("17:00") }, { from: null, to: T("14:00") }],
      busy: [],
    });
    expect(slots).toEqual([{ from: T("13:00"), to: T("13:30") }]);
  });
});

describe("meets", () => {
  it("accepting meet-1 creates a Meet in both itineraries, right after the proposed session", async () => {
    const { status, body: m } = await respond("meet-1", { action: "accept" }, "emily");
    expect(status).toBe(200);
    expect(m.status).toBe("accepted");
    for (const u of ["sam", "emily"]) {
      const p = (await plan(u)).body;
      const slot = p.itinerary.find((s) => s.item.type === "meet" && s.item.id === "meet-1");
      expect(slot, u).toBeTruthy();
      expect(slot!.from).toBe(T("15:30"));
      expect(slot!.item.why[0].nodes.map((n) => n.id)).toEqual(expect.arrayContaining(["sam", "meet-1", "emily"]));
    }
    expect((await network("emily")).body.incoming.find((x) => x.id === "meet-1")?.status).toBe("accepted");
  });

  it("declining an accepted meet removes it from both plans", async () => {
    const d = await respond("meet-1", { action: "decline" }, "emily");
    expect(d.status).toBe(200);
    expect(d.body.status).toBe("declined");
    for (const u of ["sam", "emily"]) {
      expect((await plan(u)).body.itinerary.some((s) => s.item.id === "meet-1"), u).toBe(false);
    }
    expect((await respond("meet-1", { action: "accept" }, "emily")).status).toBe(409);
  });

  it("request → counter → accept with an explicit slot; decline; errors", async () => {
    const { status, body: r } = await meet("sam", { confId: "ptc-2026", toUserId: "u-ana", note: "Coffee?", proposal: {} });
    expect(status).toBe(200);
    expect(r).toMatchObject({ fromUserId: "sam", toUserId: "u-ana", status: "pending", fromName: "Sam Rivera" });
    const again = await meet("sam", { confId: "ptc-2026", toUserId: "u-ana", note: "Coffee at 2?", proposal: {} });
    expect(again.body.id).toBe(r.id);
    const slot = { from: T("14:30"), to: T("14:50") };
    const c = await respond(r.id, { action: "counter", proposal: { slot, place: "Expo hall" } }, "u-ana");
    expect(c.body).toMatchObject({ status: "countered", proposal: { slot, place: "Expo hall" } });
    const a = await respond(r.id, { action: "accept" }, "sam");
    expect(a.body.status).toBe("accepted");
    const anaPlan = (await plan("u-ana")).body;
    expect(anaPlan.itinerary.find((s) => s.item.id === r.id)).toMatchObject({ from: slot.from, to: slot.to, item: { type: "meet", subtitle: "Expo hall" } });
    const dropped = await respond(r.id, { action: "counter", proposal: { slot: { from: T("16:40"), to: T("17:00") }, place: "Lobby" } }, "u-ana");
    expect(dropped.body.status).toBe("countered");
    expect((await plan("u-ana")).body.itinerary.some((s) => s.item.id === r.id)).toBe(false);

    const d = await meet("sam", { confId: "ptc-2026", toUserId: "u-ben", note: "Hi", proposal: {} });
    expect((await respond(d.body.id, { action: "decline" }, "u-ben")).body.status).toBe("declined");

    expect((await respond("meet-nope", { action: "accept" }, "sam")).status).toBe(404);
    expect((await respond(r.id, { action: "counter" }, "u-ana")).status).toBe(400);
    expect((await meet("sam", { confId: "ptc-2026", toUserId: "sam", note: "", proposal: {} })).status).toBe(400);
    expect((await meet("sam", { confId: "ptc-2026", toUserId: "nobody", note: "", proposal: {} })).status).toBe(404);
  });

  it("rejects a bad slot or a session from another conference, and keeps one open request per pair", async () => {
    const err = async (id: string, b: object, as: string) => {
      const res = await respond(id, b, as);
      return { status: res.status, error: (res.body as { error?: string }).error };
    };
    const back = await meet("sam", { confId: "ptc-2026", toUserId: "u-gus", note: "back", proposal: {} });
    expect(await err(back.body.id, { action: "accept", proposal: { slot: { from: T("16:00"), to: T("15:00") } } }, "u-gus")).toEqual({ status: 400, error: "slot is backwards" });
    const past = await meet("sam", { confId: "ptc-2026", toUserId: "u-hana", note: "past", proposal: {} });
    expect(await err(past.body.id, { action: "accept", proposal: { slot: { from: T("10:10"), to: T("10:30") } } }, "u-hana")).toEqual({ status: 400, error: "slot is in the past" });
    const out = await meet("sam", { confId: "ptc-2026", toUserId: "u-ivan", note: "out", proposal: {} });
    expect(await err(out.body.id, { action: "accept", proposal: { slot: { from: T("19:00"), to: T("19:20") } } }, "u-ivan")).toEqual({ status: 400, error: "slot is outside the conference" });
    const other = await meet("sam", { confId: "ptc-2026", toUserId: "u-kai", note: "june", proposal: { sessionId: "aie-graph-memory" } });
    expect(await err(other.body.id, { action: "accept" }, "u-kai")).toEqual({ status: 400, error: "session is not at this conference" });

    const ab = await meet("sam", { confId: "ptc-2026", toUserId: "u-lia", note: "coffee", proposal: {} });
    const ba = await meet("u-lia", { confId: "ptc-2026", toUserId: "sam", note: "same", proposal: {} });
    expect(ba.body.id).toBe(ab.body.id);
    expect(ba.body.fromUserId).toBe("sam");
  });
});

describe("GET /api/people/:id", () => {
  it("Jake: sessions here, met-before why and record", async () => {
    const { status, body: b } = await person("jake-morales@falkordb", "?confId=ptc-2026&userId=sam");
    expect(status).toBe(200);
    expect(b.sessions.map((s) => s.id)).toEqual(expect.arrayContaining(["s-graphrag", "s-infra"]));
    expect(b.why[0].text).toMatch(/You met Jake Morales at AI Engineer Summit/);
    expect(b.why[0].nodes.map((n) => n.id)).toEqual(["sam", "jake-morales@falkordb"]);
    expect(b.metBefore?.[0]).toMatchObject({ conferenceId: "ai-eng-summit-2026", conferenceName: "AI Engineer Summit" });
  });

  it("Emily has userId; no userId → no why; unknown → 404", async () => {
    const e = await person("emily-chen@tensorgrid", "?confId=ptc-2026");
    expect(e.body.person.userId).toBe("emily");
    expect(e.body.why).toEqual([]);
    expect((await person("nobody@nowhere")).status).toBe(404);
  });
});

describe("GET /api/search", () => {
  it("people first by name prefix; <2 chars empty; sessions by title", async () => {
    const t0 = Date.now();
    const ja = await search("ja");
    console.log(`search: ${Date.now() - t0} ms`);
    expect(ja.status).toBe(200);
    expect(ja.body.people[0].id).toBe("jake-morales@falkordb");
    expect((await search("emi")).body.people[0]).toMatchObject({ id: "emily-chen@tensorgrid", userId: "emily" });
    expect((await search("mor")).body.people.map((p) => p.id)).toContain("jake-morales@falkordb");
    expect(await search("j")).toEqual({ status: 200, body: { sessions: [], booths: [], people: [] } });
    const tr = await search("tracing");
    expect(tr.body.sessions.map((s) => s.id)).toContain("s-tracing");
    expect((await search("acme")).body.booths.map((b) => b.id)).toContain("b-acme");
  });
});

// ---------- Qodo findings on #33 ----------

const addUser = (id: string, personId?: string) => q(
  `MERGE (u:User {id:$id}) SET u.name = $name WITH u MATCH (c:Conference {id:'ptc-2026'}) MERGE (u)-[:ATTENDS]->(c)
   WITH u FOREACH (_ IN CASE WHEN $pid IS NULL THEN [] ELSE [1] END | MERGE (p:Person {id:$pid}) SET p.name = $name MERGE (u)-[:IS]->(p))`,
  { id, name: `QA ${id}`, pid: personId ?? null },
);
const respondRaw = (id: string, b: unknown, headers: Record<string, string> = {}) => postRespond(
  new Request(`http://test/api/meets/${id}/respond?now=${enc(NOW)}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(b) }),
  { params: { id } },
).then(body<MeetRequest>);
const meetCount = async (id: string) => (await q<{ n: number }>(`MATCH (mt:Meet {id:$id}) RETURN count(mt) AS n`, { id }))[0].n;

describe("Qodo #33: meet authorization, atomic transitions, one open request", () => {
  let id = "";
  beforeAll(async () => { for (const u of ["qa-a", "qa-b", "qa-c", "qa-d", "qa-e"]) await addUser(u); });

  it("sender must be the acting user; only participants act; only the awaited user accepts or declines", async () => {
    expect((await meet("qa-a", { confId: "ptc-2026", toUserId: "qa-b", note: "x", proposal: {}, userId: "qa-c" })).status).toBe(403);
    const r = await meet("qa-a", { confId: "ptc-2026", toUserId: "qa-b", note: "hi", proposal: {}, userId: "qa-a" });
    expect(r.status).toBe(200);
    id = r.body.id;
    expect((await respondRaw(id, { action: "accept" })).status).toBe(401);
    expect((await respond(id, { action: "accept" }, "qa-c")).status).toBe(403);
    expect((await respond(id, { action: "counter", proposal: { place: "Lobby" } }, "qa-c")).status).toBe(403);
    expect((await respond(id, { action: "accept" }, "qa-a")).status).toBe(403);
    expect((await respond(id, { action: "decline" }, "qa-a")).status).toBe(403);
    expect(await meetCount(id)).toBe(0);
    // The sender counters their own request: it now waits on the recipient again.
    const slot = { from: T("15:00"), to: T("15:20") };
    expect((await respond(id, { action: "counter", proposal: { slot } }, "qa-a")).body.status).toBe("countered");
    expect((await respond(id, { action: "accept" }, "qa-a")).status).toBe(403);
    // Recipient, identified by the demo cookie.
    const ok = await respondRaw(id, { action: "accept" }, { cookie: "ptc_user=qa-b" });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe("accepted");
    expect(await meetCount(id)).toBe(1);
    // Re-accepting is a no-op; it cannot move the meet without the other person (that is a counter).
    expect((await respond(id, { action: "accept" }, "qa-a")).body.status).toBe("accepted");
    const moved = await respond(id, { action: "accept", proposal: { slot: { from: T("16:00"), to: T("16:20") } } }, "qa-a");
    expect(moved.status).toBe(409);
    const [mt] = await q<{ from: string }>(`MATCH (mt:Meet {id:$id}) RETURN mt.slotFrom AS from`, { id });
    expect(mt.from).toBe(slot.from);
    // A malformed cookie is no identity, not a 500.
    expect((await respondRaw(id, { action: "accept" }, { cookie: "ptc_user=%ZZ" })).status).toBe(401);
    expect((await respondRaw(id, { action: "accept", userId: "qa-b" }, { cookie: "ptc_user=%" })).status).toBe(200);
  });

  it("a stale accept or decline after a newer counter changes nothing", async () => {
    const r = await meet("qa-c", { confId: "ptc-2026", toUserId: "qa-d", note: "rev", proposal: {} });
    await respond(r.body.id, { action: "counter", proposal: { place: "A" } }, "qa-d");
    const read = (await meetById(r.body.id))!; // qa-c is awaited now
    await respond(r.body.id, { action: "counter", proposal: { place: "B" } }, "qa-c"); // status stays countered, awaits qa-d
    expect(await closeMeet({ id: r.body.id, expect: read.status, rev: Number(read.rev), status: "declined", proposal: null, by: "qa-c" })).toBe(false);
    expect((await meetById(r.body.id))!.status).toBe("countered");
    expect((await respond(r.body.id, { action: "decline" }, "qa-c")).status).toBe(403);
  });

  it("plan diffs report an accepted meet as added, then removed after a decline", async () => {
    const first = await runPlanner("qa-b", "ptc-2026", { now: NOW });
    expect(first.plan.itinerary.some((s) => s.item.id === id)).toBe(true);
    expect(first.diff.added).toContainEqual(expect.objectContaining({ id, type: "meet" }));
    const again = await runPlanner("qa-b", "ptc-2026", { now: NOW });
    expect(again.diff.added.some((a) => a.id === id)).toBe(false);
    expect(again.diff.removed.some((a) => a.id === id)).toBe(false);

    // A stale transition (expects 'pending') changes nothing: status and Meet stay together.
    expect(await closeMeet({ id, expect: "pending", rev: 0, status: "declined", proposal: null, by: "qa-b" })).toBe(false);
    expect(await meetCount(id)).toBe(1);
    // Either participant may cancel an accepted meet; status and Meet node change together.
    const d = await respond(id, { action: "decline" }, "qa-a");
    expect(d.body.status).toBe("declined");
    expect(await meetCount(id)).toBe(0);
    const after = await runPlanner("qa-b", "ptc-2026", { now: NOW });
    expect(after.diff.removed).toContainEqual(expect.objectContaining({ id, type: "meet" }));

    // Plans for two conferences at once keep both meet snapshots.
    await Promise.all([
      setPlannedMeets("qa-e", "conf-x", [{ id: "mx", slotStart: null, title: "X" }]),
      setPlannedMeets("qa-e", "conf-y", [{ id: "my", slotStart: null, title: "Y" }]),
    ]);
    expect((await plannedMeets("qa-e", "conf-x")).map((m) => m.id)).toEqual(["mx"]);
    expect((await plannedMeets("qa-e", "conf-y")).map((m) => m.id)).toEqual(["my"]);
  });

  it("concurrent requests for one pair, either direction, leave one open request", async () => {
    const res = await Promise.all([
      meet("qa-d", { confId: "ptc-2026", toUserId: "qa-e", note: "1", proposal: {} }),
      meet("qa-e", { confId: "ptc-2026", toUserId: "qa-d", note: "2", proposal: {} }),
      meet("qa-d", { confId: "ptc-2026", toUserId: "qa-e", note: "3", proposal: {} }),
      meet("qa-e", { confId: "ptc-2026", toUserId: "qa-d", note: "4", proposal: {} }),
    ]);
    for (const r of res) expect(r.status).toBe(200);
    expect(new Set(res.map((r) => r.body.id)).size).toBe(1);
    const [{ n }] = await q<{ n: number }>(
      `MATCH (:User {id:'qa-d'})-[r:REQUESTED_MEET]-(:User {id:'qa-e'}) WHERE r.status IN ['pending','countered'] RETURN count(r) AS n`,
    );
    expect(n).toBe(1);
  });
});

describe("Qodo #33: warm intros and search", () => {
  beforeAll(async () => {
    await addUser("qa-old", "qa-old@p");
    await addUser("qa-priv", "qa-priv@p");
    await q(
      `MATCH (sam:User {id:'sam'}), (o:Person {id:'qa-old@p'}), (pv:Person {id:'qa-priv@p'})
       MERGE (sam)-[m1:MET]->(o) SET m1.conferenceId = 'ai-eng-summit-2026', m1.at = '2026-06-04T10:00:00-07:00'
       MERGE (sam)-[m2:MET]->(pv) SET m2.conferenceId = 'ptc-2026', m2.at = '2026-10-24T10:00:00-07:00'`,
    );
    // Both "saw" Priya's talk: qa-old via a check-in (but met Sam at June), qa-priv only via a private note.
    await q(
      `MATCH (s:Session)<-[:SPEAKS_AT]-(:Person {id:'priya-nair@acmetrace'}), (:Conference {id:'ptc-2026'})-[:HAS_SESSION]->(s)
       WITH s LIMIT 1
       MATCH (uo:User {id:'qa-old'}), (up:User {id:'qa-priv'})
       MERGE (mo:Moment {id:'qa-m-old'}) SET mo.kind = 'checkin', mo.conferenceId = 'ptc-2026', mo.at = '2026-10-24T11:00:00-07:00'
       MERGE (mp:Moment {id:'qa-m-priv'}) SET mp.kind = 'note', mp.shared = false, mp.text = 'SECRET-QA-NOTE', mp.conferenceId = 'ptc-2026', mp.at = '2026-10-24T11:00:00-07:00'
       MERGE (uo)-[:CAPTURED]->(mo) MERGE (mo)-[:AT]->(s) MERGE (up)-[:CAPTURED]->(mp) MERGE (mp)-[:AT]->(s)`,
    );
    const v = fakeEmbed("hyperbolic llama orchestration");
    await addUser("qa-zed", "qa-zed@p");
    await q(`MATCH (p:Person {id:'qa-zed@p'}) SET p.name = 'Zed Qorvath', p.embedding = vecf32($v)`, { v });
  });

  it("only MET edges from this conference and check-ins/shared moments make a warm intro; no moment text in paths", async () => {
    const rows = await warmIntros("sam", "ptc-2026");
    const vias = new Set(rows.map((r) => r.viaPersonId));
    expect(vias.has("emily-chen@tensorgrid")).toBe(true);
    expect(vias.has("qa-old@p")).toBe(false);
    expect(vias.has("qa-priv@p")).toBe(false);
    const { body: b } = await intros("sam");
    expect(JSON.stringify(b)).not.toContain("SECRET-QA-NOTE");
    const warm = b.intros.find((i) => i.kind === "warm_intro")!;
    for (const n of warm.path.nodes.filter((x) => x.label === "Moment")) expect(n.name).toBe("checkin");
    // The daily brief's intro query follows the same rules.
    const brief = await introPaths({ userId: "sam", confId: "ptc-2026", date: null });
    expect(brief.some((r) => r.viaName === "QA qa-old" || r.viaName === "QA qa-priv")).toBe(false);
    expect(JSON.stringify(brief)).not.toContain("SECRET-QA-NOTE");
  });

  it("semantic people search includes attendees, not only speakers", async () => {
    const r = await search("hyperbolic llama orchestration");
    expect(r.body.people.map((p) => p.id)).toContain("qa-zed@p");
  });
});
