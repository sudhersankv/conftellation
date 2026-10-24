import { beforeAll, describe, expect, it, vi } from "vitest";
import { GET as getIntros } from "@/app/api/users/[id]/intros/route";
import { GET as getNetwork } from "@/app/api/users/[id]/network/route";
import { POST as postMeet } from "@/app/api/users/[id]/meet/route";
import { POST as postRespond } from "@/app/api/meets/[id]/respond/route";
import { GET as getPerson } from "@/app/api/people/[id]/route";
import { GET as getSearch } from "@/app/api/search/route";
import { GET as getPlan } from "@/app/api/users/[id]/plan/route";
import { freeSlots } from "@/lib/agents/network";
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
const respond = (id: string, b: unknown) => postRespond(req(`/api/meets/${id}/respond?now=${enc(NOW)}`, b), { params: { id } }).then(body<MeetRequest>);
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
});

describe("meets", () => {
  it("accepting meet-1 creates a Meet in both itineraries, right after the proposed session", async () => {
    const { status, body: m } = await respond("meet-1", { action: "accept" });
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

  it("request → counter → accept with an explicit slot; decline; errors", async () => {
    const { status, body: r } = await meet("sam", { confId: "ptc-2026", toUserId: "u-ana", note: "Coffee?", proposal: {} });
    expect(status).toBe(200);
    expect(r).toMatchObject({ fromUserId: "sam", toUserId: "u-ana", status: "pending", fromName: "Sam Rivera" });
    const again = await meet("sam", { confId: "ptc-2026", toUserId: "u-ana", note: "Coffee at 2?", proposal: {} });
    expect(again.body.id).toBe(r.id);
    const slot = { from: T("14:30"), to: T("14:50") };
    const c = await respond(r.id, { action: "counter", proposal: { slot, place: "Expo hall" } });
    expect(c.body).toMatchObject({ status: "countered", proposal: { slot, place: "Expo hall" } });
    const a = await respond(r.id, { action: "accept" });
    expect(a.body.status).toBe("accepted");
    const anaPlan = (await plan("u-ana")).body;
    expect(anaPlan.itinerary.find((s) => s.item.id === r.id)).toMatchObject({ from: slot.from, to: slot.to, item: { type: "meet", subtitle: "Expo hall" } });

    const d = await meet("sam", { confId: "ptc-2026", toUserId: "u-ben", note: "Hi", proposal: {} });
    expect((await respond(d.body.id, { action: "decline" })).body.status).toBe("declined");

    expect((await respond("meet-nope", { action: "accept" })).status).toBe(404);
    expect((await respond(r.id, { action: "counter" })).status).toBe(400);
    expect((await meet("sam", { confId: "ptc-2026", toUserId: "sam", note: "", proposal: {} })).status).toBe(400);
    expect((await meet("sam", { confId: "ptc-2026", toUserId: "nobody", note: "", proposal: {} })).status).toBe(404);
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
