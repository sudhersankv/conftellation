import { beforeAll, describe, expect, it, vi } from "vitest";
import { GET as getPlan } from "@/app/api/users/[id]/plan/route";
import { POST as postFeedback } from "@/app/api/users/[id]/feedback/route";
import type { PlanResponse } from "@/lib/types";
import { req, seedOnce } from "./helpers";

vi.mock("@/lib/llm", async (orig) => (await import("./fakes")).fakeLlm(await orig()));
vi.mock("@/lib/brightdata", () => ({}));

beforeAll(() => seedOnce(), 180_000);

const NOW = "2026-10-24T12:30:00-07:00";
const plan = async (user = "sam") => {
  const res = await getPlan(req(`/api/users/${user}/plan?confId=ptc-2026&now=${encodeURIComponent(NOW)}`), { params: { id: user } });
  return { status: res.status, body: (await res.json()) as PlanResponse };
};
const feedback = async (targetId: string, kind: "skip" | "boost") => {
  const res = await postFeedback(req(`/api/users/sam/feedback?now=${encodeURIComponent(NOW)}`, { confId: "ptc-2026", targetId, kind }), { params: { id: "sam" } });
  return { status: res.status, body: (await res.json()) as PlanResponse };
};

describe("GET /api/users/:id/plan", () => {
  it("returns a plan where every item carries a real why path", async () => {
    const { status, body } = await plan();
    expect(status).toBe(200);
    expect(body.itinerary.length).toBeGreaterThan(3);
    expect(body.byGoal.map((g) => g.goal.id).sort()).toEqual(["g-infra", "g-role", "g-tracing"]);
    const items = [...body.itinerary.map((s) => s.item).filter((i) => i.type !== "block"), ...body.byGoal.flatMap((g) => [...g.sessions, ...g.people, ...g.booths])];
    for (const it of items) {
      expect(it.why.length, it.id).toBeGreaterThan(0);
      for (const w of it.why) {
        expect(w.nodes.length).toBeGreaterThan(1);
        expect(w.edges.length).toBe(w.nodes.length - 1);
        expect(w.text).toBeTruthy();
        expect(w.text.length, w.text).toBeLessThanOrEqual(110);
      }
    }
  });

  it("ranks Jake first with the met-before why, and never double-books sessions", async () => {
    const { body } = await plan();
    const tracing = body.byGoal.find((g) => g.goal.id === "g-tracing")!;
    expect(tracing.people[0].id).toBe("jake-morales@falkordb");
    expect(tracing.people[0].why[0].text).toMatch(/met/i);
    const sessions = body.itinerary.filter((s) => s.item.type === "session");
    for (let i = 1; i < sessions.length; i++) expect(sessions[i].from >= sessions[i - 1].to).toBe(true);
    const booths = body.itinerary.filter((s) => s.item.type === "booth");
    for (const b of booths) expect(b.from >= NOW).toBe(true);
  });

  it("returns an empty plan for an unknown user and 400s without confId", async () => {
    const empty = await plan("nobody");
    expect(empty.status).toBe(200);
    expect(empty.body).toMatchObject({ itinerary: [], byGoal: [] });
    const res = await getPlan(req(`/api/users/sam/plan`), { params: { id: "sam" } });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/users/:id/feedback", () => {
  it("skip removes a session from the plan, boost brings it back", async () => {
    const before = await plan();
    expect(before.body.itinerary.some((s) => s.item.id === "s-tracing")).toBe(true);

    const skipped = await feedback("s-tracing", "skip");
    expect(skipped.status).toBe(200);
    expect(skipped.body.itinerary.some((s) => s.item.id === "s-tracing")).toBe(false);
    expect(skipped.body.byGoal.flatMap((g) => g.sessions).some((s) => s.id === "s-tracing")).toBe(false);

    const boosted = await feedback("s-tracing", "boost");
    expect(boosted.body.itinerary.some((s) => s.item.id === "s-tracing")).toBe(true);
  });

  it("rejects bad bodies and unknown targets", async () => {
    const bad = await postFeedback(req(`/api/users/sam/feedback`, { confId: "ptc-2026", targetId: "s-tracing", kind: "love" }), { params: { id: "sam" } });
    expect(bad.status).toBe(400);
    expect((await feedback("s-nope", "skip")).status).toBe(404);
  });
});
