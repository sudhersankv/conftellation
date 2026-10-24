import { beforeAll, describe, expect, it, vi } from "vitest";
import { POST as postSteer } from "@/app/api/users/[id]/steer/route";
import { POST as postOnboarding } from "@/app/api/users/[id]/onboarding/route";
import { GET as getPlan } from "@/app/api/users/[id]/plan/route";
import { q } from "@/lib/falkor";
import { attendeePersonId } from "@/lib/agents/onboarding";
import { parseDeterministic, type SteerContext } from "@/lib/agents/steer/parse";
import type { OnboardingResponse, PlanResponse, SteerOp, SteerResponse } from "@/lib/types";
import { req, seedOnce } from "./helpers";

const llm = vi.hoisted(() => ({ impl: undefined as undefined | ((...a: unknown[]) => unknown), calls: 0 }));
vi.mock("@/lib/llm", async (orig) =>
  (await import("./fakes")).fakeLlm(await orig(), (...a: unknown[]) => {
    llm.calls++;
    if (!llm.impl) throw new Error("no LLM in this test");
    return llm.impl(...a);
  }),
);
vi.mock("@/lib/brightdata", () => ({}));

beforeAll(() => seedOnce(), 180_000);

const NOW = "2026-10-24T12:30:00-07:00";
const T = (hhmm: string) => `2026-10-24T${hhmm}:00-07:00`;
const steer = async (body: { text?: string; ops?: SteerOp[] }, user = "sam") => {
  const res = await postSteer(req(`/api/users/${user}/steer?now=${encodeURIComponent(NOW)}`, { confId: "ptc-2026", text: "", ...body }), { params: { id: user } });
  return { status: res.status, body: (await res.json()) as SteerResponse };
};
const plan = async (user = "sam") =>
  (await (await getPlan(req(`/api/users/${user}/plan?confId=ptc-2026&now=${encodeURIComponent(NOW)}`), { params: { id: user } })).json()) as PlanResponse;
const sessionIds = (p: PlanResponse) => p.itinerary.filter((s) => s.item.type === "session").map((s) => s.item.id);

describe("deterministic steer parser", () => {
  const ctx: SteerContext = {
    date: "2026-10-24", offset: "-07:00", now: NOW, window: { from: null, to: null }, topics: [],
    goals: [{ id: "g-role", text: "open to a new role", weight: 0.5, topics: ["hiring"] }],
  };
  it("parses windows, blocks, booth time, more/less/skip", () => {
    expect(parseDeterministic("leaving at 3pm, more tracing, less hiring", ctx)).toEqual([
      { op: "set_window", from: null, to: T("15:00") },
      { op: "boost", kind: "topic", match: "tracing" },
      { op: "reweight_goal", goalId: "g-role", weight: 0.2 },
    ]);
    expect(parseDeterministic("free after 3pm", ctx)).toEqual([{ op: "set_window", from: T("15:00"), to: null }]);
    expect(parseDeterministic("lunch 12-1", ctx)).toEqual([{ op: "block_time", from: T("12:00"), to: T("13:00"), label: "lunch" }]);
    expect(parseDeterministic("meeting at 2:30", ctx)).toEqual([{ op: "block_time", from: T("14:30"), to: T("15:00"), label: "meeting" }]);
    expect(parseDeterministic("5 min per booth", ctx)).toEqual([{ op: "booth_time", minutes: 5 }]);
    expect(parseDeterministic("skip the scraping workshop", ctx)).toEqual([{ op: "exclude", kind: "session", match: "scraping workshop" }]);
    expect(parseDeterministic("what is the wifi password", ctx)).toEqual([]);
  });
});

describe("POST /api/users/:id/steer", () => {
  it("'leaving at 3pm, more tracing, less hiring' → set_window + boost + reweight, non-empty diff, persisted", async () => {
    const before = await plan();
    expect(sessionIds(before)).toContain("s-infra");
    const { status, body } = await steer({ text: "leaving at 3pm, more tracing, less hiring" });
    expect(status).toBe(200);
    expect(body.ops.map((o) => o.op)).toEqual(["set_window", "boost", "reweight_goal"]);
    const boost = body.ops[1] as Extract<SteerOp, { op: "boost" }>;
    expect(boost.resolvedIds).toContain("agent tracing");
    expect(body.diff.removed.map((r) => r.id)).toContain("s-infra");
    const planIds = new Set(before.itinerary.map((s) => s.item.id).concat(before.byGoal.flatMap((g) => g.people.map((p) => p.id))));
    for (const r of body.diff.removed) expect(planIds.has(r.id), r.id).toBe(true);
    expect(body.summary).toMatch(/leaving at 3pm/);
    for (const s of body.plan.itinerary) expect(s.to <= T("15:00"), s.item.id).toBe(true);

    const after = await plan();
    expect(after.itinerary.every((s) => s.to <= T("15:00"))).toBe(true);
    const [steered] = await q<{ n: number }>(`MATCH (:User {id:'sam'})-[:STEERED]->(s:Steer) RETURN count(s) AS n`);
    expect(steered.n).toBeGreaterThan(0);
    // boosted topic shows up as a real why path on a tracing session
    const tracing = after.itinerary.find((s) => s.item.id === "s-tracing")!;
    expect(tracing.item.why.some((w) => w.edges.some((e) => e.type === "BOOSTED"))).toBe(true);

    // Undo: send the inverse ops back
    const undone = await steer({ text: "undo", ops: body.undo });
    expect(undone.status).toBe(200);
    expect(sessionIds(undone.body.plan)).toContain("s-infra");
    const [u] = await q<{ to: string | null; w: number }>(`MATCH (u:User {id:'sam'})-[:HAS_GOAL]->(g:Goal {id:'g-role'}) RETURN u.availTo AS to, g.weight AS w`);
    expect(u).toEqual({ to: null, w: 0.5 });
    const [b] = await q<{ n: number }>(`MATCH (:User {id:'sam'})-[r:BOOSTED]->(:Topic {id:'agent tracing'}) RETURN count(r) AS n`);
    expect(b.n).toBe(0);
  });

  it("lunch block shows as a block item and clears that hour", async () => {
    const { body } = await steer({ text: "lunch 12:30-1:30" });
    expect(body.ops).toEqual([{ op: "block_time", from: T("12:30"), to: T("13:30"), label: "lunch" }]);
    const block = body.plan.itinerary.find((s) => s.item.type === "block");
    expect(block?.item.title).toBe("lunch");
    expect(sessionIds(body.plan)).not.toContain("s-tracing");
    await steer({ ops: body.undo });
  });

  it("unparseable text → ops [], hint, plan unchanged", async () => {
    const before = await q<{ id: string }>(`MATCH (:User {id:'sam'})-[r:PLANS]->(x) RETURN x.id AS id ORDER BY id`);
    const { status, body } = await steer({ text: "what is the wifi password" });
    expect(status).toBe(200);
    expect(body.ops).toEqual([]);
    expect(body.summary).toMatch(/Didn't catch that/);
    expect(body.diff).toEqual({ added: [], removed: [], moved: [] });
    expect(await q(`MATCH (:User {id:'sam'})-[r:PLANS]->(x) RETURN x.id AS id ORDER BY id`)).toEqual(before);
  });

  it("uses LLM ops when available, resolving match text and dropping unknown goal ids", async () => {
    llm.impl = () => ({
      ops: [
        { op: "exclude", kind: "session", match: "web scraping", text: null, goalId: null, weight: null, from: null, to: null, label: null, minutes: null, targetId: null },
        { op: "reweight_goal", goalId: "g-made-up", weight: 0.1, text: null, kind: null, from: null, to: null, label: null, minutes: null, match: null, targetId: null },
      ],
    });
    const calls = llm.calls;
    const { body } = await steer({ text: "no scraping stuff" });
    llm.impl = undefined;
    expect(llm.calls).toBe(calls + 1);
    expect(body.ops).toHaveLength(1);
    expect(body.ops[0]).toMatchObject({ op: "exclude", resolvedIds: ["s-scrape"] });
    expect(sessionIds(body.plan)).not.toContain("s-scrape");
    await steer({ ops: body.undo });
  });

  it("404s for an unknown user, 400s for a bad body", async () => {
    expect((await steer({ text: "leaving at 3pm" }, "nobody")).status).toBe(404);
    const res = await postSteer(req(`/api/users/sam/steer`, { text: "x" }), { params: { id: "sam" } });
    expect(res.status).toBe(400);
  });

  it("undo of a replaced block restores the previous label", async () => {
    const first = await steer({ ops: [{ op: "block_time", from: T("16:00"), to: T("16:30"), label: "meeting" }] });
    const second = await steer({ ops: [{ op: "block_time", from: T("16:00"), to: T("16:30"), label: "lunch" }] });
    const [mid] = await q<{ blocks: string }>(`MATCH (u:User {id:'sam'}) RETURN u.blocks AS blocks`);
    expect(JSON.parse(mid.blocks)).toEqual([{ from: T("16:00"), to: T("16:30"), label: "lunch" }]);
    const undone = await steer({ ops: second.body.undo });
    const [restored] = await q<{ blocks: string }>(`MATCH (u:User {id:'sam'}) RETURN u.blocks AS blocks`);
    expect(JSON.parse(restored.blocks)).toEqual([{ from: T("16:00"), to: T("16:30"), label: "meeting" }]);
    await steer({ ops: first.body.undo });
    const [after] = await q<{ blocks: string | null }>(`MATCH (u:User {id:'sam'}) RETURN u.blocks AS blocks`);
    const left = after.blocks ? JSON.parse(after.blocks) as { from: string }[] : [];
    expect(left.some((b) => b.from === T("16:00"))).toBe(false);
  });

  it("drops a reweight after remove_goal, and undo restores the original goal id", async () => {
    const { status, body } = await steer({
      ops: [
        { op: "remove_goal", goalId: "g-role" },
        { op: "reweight_goal", goalId: "g-role", weight: 0.1 },
      ],
    });
    expect(status).toBe(200);
    expect(body.ops.map((o) => o.op)).toEqual(["remove_goal"]);
    const [gone] = await q<{ n: number }>(`MATCH (:User {id:'sam'})-[:HAS_GOAL]->(g:Goal {id:'g-role'}) RETURN count(g) AS n`);
    expect(gone.n).toBe(0);
    expect(body.undo).toContainEqual(expect.objectContaining({ op: "add_goal", goalId: "g-role", weight: 0.5 }));
    const undone = await steer({ ops: body.undo });
    expect(undone.status).toBe(200);
    const [g] = await q<{ id: string; w: number; topics: string[] }>(
      `MATCH (:User {id:'sam'})-[:HAS_GOAL]->(g:Goal {id:'g-role'})
       OPTIONAL MATCH (g)-[:ABOUT]->(t:Topic)
       RETURN g.id AS id, g.weight AS w, collect(t.id) AS topics`,
    );
    expect(g).toMatchObject({ id: "g-role", w: 0.5 });
    expect(g.topics).toContain("hiring");
  });
});

describe("POST /api/users/:id/onboarding", () => {
  it("creates the user, goals, problems, ATTENDS and window; GET plan is non-empty", async () => {
    const res = await postOnboarding(
      req(`/api/users/dana/onboarding?now=${encodeURIComponent(NOW)}`, {
        confId: "ptc-2026", name: "Dana Test", openTo: ["learning"], availTo: T("16:00"),
        goals: [{ text: "learn about agent tracing", kind: "learn" }, { text: "scale inference", kind: "learn", topics: ["ai infrastructure"] }],
        problems: ["our agents fail in production and we can't see why"],
      }),
      { params: { id: "dana" } },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as OnboardingResponse;
    expect(body.goals).toHaveLength(2);
    expect(body.goals[0].topics).toContain("agent tracing");
    expect(body.goals[1].topics).toContain("ai infrastructure");
    expect(body.goals.map((g) => g.weight)).toEqual([1, 0.8]);
    expect(body.problems).toHaveLength(1);
    const [u] = await q<{ attends: number; to: string; pid: string }>(
      `MATCH (u:User {id:'dana'})-[:ATTENDS]->(:Conference {id:'ptc-2026'}) MATCH (u)-[:IS]->(p:Person) RETURN count(*) AS attends, u.availTo AS to, p.id AS pid`,
    );
    expect(u.attends).toBe(1);
    expect(u.to).toBe(T("16:00"));
    const p = await plan("dana");
    expect(p.itinerary.length).toBeGreaterThan(0);
    expect(p.itinerary.every((s) => s.to <= T("16:00"))).toBe(true);
  });

  it("does not merge person ids when user ids slug the same", async () => {
    expect(attendeePersonId("Alex Kim", "alex-kim")).not.toBe(attendeePersonId("Alex Kim", "alex kim"));
    expect(attendeePersonId("Alex Kim", "alex kim")).toContain("alex%20kim");
    const body = {
      confId: "ptc-2026", name: "Alex Kim", openTo: ["learning" as const],
      goals: [{ text: "learn about agent tracing", kind: "learn" as const }], problems: [] as string[],
    };
    for (const id of ["alex-kim", "alex kim"]) {
      const res = await postOnboarding(
        req(`/api/users/${encodeURIComponent(id)}/onboarding?now=${encodeURIComponent(NOW)}`, body),
        { params: { id } },
      );
      expect(res.status, await res.clone().text()).toBe(200);
    }
    const rows = await q<{ u: string; p: string }>(
      `MATCH (u:User)-[:IS]->(p:Person) WHERE u.id IN $ids RETURN u.id AS u, p.id AS p`,
      { ids: ["alex-kim", "alex kim"] },
    );
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.p)).size).toBe(2);
    expect(rows.find((r) => r.u === "alex kim")?.p).toBe(attendeePersonId("Alex Kim", "alex kim"));
    expect(rows.find((r) => r.u === "alex-kim")?.p).toBe(attendeePersonId("Alex Kim", "alex-kim"));
  });

  it("404s for an unknown conference, 400s without goals", async () => {
    const r1 = await postOnboarding(req(`/api/users/dana/onboarding`, { confId: "nope", goals: [], problems: [], openTo: [] }), { params: { id: "dana" } });
    expect(r1.status).toBe(404);
    const r2 = await postOnboarding(req(`/api/users/dana/onboarding`, { confId: "ptc-2026" }), { params: { id: "dana" } });
    expect(r2.status).toBe(400);
  });
});
