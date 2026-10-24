import { beforeAll, describe, expect, it, vi } from "vitest";
import { GET as getSky } from "@/app/api/users/[id]/constellation/route";
import { GET as getPlan } from "@/app/api/users/[id]/plan/route";
import { POST as postMoment } from "@/app/api/users/[id]/moments/route";
import { POST as postFeedback } from "@/app/api/users/[id]/feedback/route";
import { GET as getBrief } from "@/app/api/users/[id]/brief/route";
import { MAX_DUST_PER_CONF, MAX_NODES } from "@/lib/constellation";
import type { BriefResponse, ConstellationResponse, CreateMomentResponse, PlanResponse } from "@/lib/types";
import { req, seedOnce } from "./helpers";

vi.mock("@/lib/llm", async (orig) => (await import("./fakes")).fakeLlm(await orig()));
vi.mock("@/lib/brightdata", () => ({}));

beforeAll(() => seedOnce(), 180_000);

const NOW = "2026-10-24T13:10:00-07:00";
const sky = async (user = "sam", confId: string | null = "ptc-2026") => {
  const qs = new URLSearchParams({ now: NOW, ...(confId ? { confId } : {}) });
  const res = await getSky(req(`/api/users/${user}/constellation?${qs}`), { params: { id: user } });
  return { status: res.status, body: (await res.json()) as ConstellationResponse };
};
const plan = async () =>
  (await (await getPlan(req(`/api/users/sam/plan?confId=ptc-2026&now=${encodeURIComponent(NOW)}`), { params: { id: "sam" } })).json()) as PlanResponse;

function checkShape(body: ConstellationResponse, userId = "sam") {
  expect(body.nodes.length).toBeLessThanOrEqual(MAX_NODES);
  const ids = new Set(body.nodes.map((n) => n.id));
  expect(ids.size).toBe(body.nodes.length);
  for (const l of body.links) {
    expect(ids.has(l.source), `link source ${l.source}`).toBe(true);
    expect(ids.has(l.target), `link target ${l.target}`).toBe(true);
  }
  for (const n of body.nodes) {
    if (n.id === userId || n.isOtherUser) continue;
    expect(n.conferenceId, `${n.type} ${n.id} has conferenceId`).toBeTruthy();
    if (n.fit !== undefined) expect(n.fit >= 0 && n.fit <= 1, `${n.id} fit ${n.fit}`).toBe(true);
  }
  const dust = new Map<string, number>();
  for (const n of body.nodes) if (n.state === "dust") dust.set(n.conferenceId!, (dust.get(n.conferenceId!) ?? 0) + 1);
  for (const v of dust.values()) expect(v).toBeLessThanOrEqual(MAX_DUST_PER_CONF);
}

describe("GET /api/users/:id/constellation", () => {
  it("contains every node of every plan why-path, with conferenceId and fit", async () => {
    const t0 = Date.now();
    const [{ status, body }, p] = await Promise.all([sky(), plan()]);
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(status).toBe(200);
    checkShape(body);
    const byId = new Map(body.nodes.map((n) => [n.id, n]));
    expect(byId.get("sam")).toMatchObject({ type: "user", state: "anchor" });
    expect(byId.get("ptc-2026")).toMatchObject({ type: "conference", state: "anchor" });
    expect(byId.get("g-tracing")).toMatchObject({ type: "goal", state: "anchor", conferenceId: "ptc-2026" });

    const items = [...p.itinerary.map((s) => s.item).filter((i) => i.type !== "block"), ...p.byGoal.flatMap((g) => [...g.sessions, ...g.people, ...g.booths])];
    for (const it of items) {
      expect(byId.has(it.id), `plan item ${it.id}`).toBe(true);
      for (const w of it.why) for (const n of w.nodes) expect(byId.has(n.id), `why node ${n.label} ${n.id}`).toBe(true);
    }
    expect(body.nodes.some((n) => n.type === "topic")).toBe(true);
    expect(byId.get("s-graphrag")?.state).toBe("done");
    expect(Math.max(...body.nodes.filter((n) => n.fit !== undefined && n.type !== "goal").map((n) => n.fit!))).toBe(1);
    expect(body.nodes.some((n) => n.state === "dust")).toBe(true);
    expect(body.nodes.some((n) => n.isOtherUser && n.type === "user")).toBe(true);
    expect(body.coverage.map((c) => c.goalId).sort()).toEqual(["g-infra", "g-role", "g-tracing"]);
    expect(body.coverage.find((c) => c.goalId === "g-tracing")!.planned).toBeGreaterThan(0);
  });

  it("lit ids from a capture are in the next constellation, and the target lights up", async () => {
    const form = new FormData();
    form.append("confId", "ptc-2026");
    form.append("kind", "checkin");
    form.append("targetId", "s-gpu");
    const res = await postMoment(new Request(`http://test/api/users/sam/moments?now=${encodeURIComponent(NOW)}`, { method: "POST", body: form }), { params: { id: "sam" } });
    const { lit, moment } = (await res.json()) as CreateMomentResponse;
    expect(res.status).toBe(200);
    const { body } = await sky();
    const byId = new Map(body.nodes.map((n) => [n.id, n]));
    for (const id of lit) expect(byId.has(id), `lit ${id}`).toBe(true);
    expect(byId.get(moment.id)).toMatchObject({ type: "moment", state: "done" });
    expect(["done", "unplanned"]).toContain(byId.get("s-gpu")!.state);
    expect(body.links).toContainEqual({ source: moment.id, target: "s-gpu", type: "AT" });
  });

  it("brief paths can be traced in the Sky", async () => {
    const res = await getBrief(req(`/api/users/sam/brief?confId=ptc-2026`), { params: { id: "sam" } });
    const brief = (await res.json()) as BriefResponse;
    expect(res.status).toBe(200);
    expect(brief.paths.length).toBeGreaterThan(0);
    const { body } = await sky();
    const ids = new Set(body.nodes.map((n) => n.id));
    for (const p of brief.paths) for (const n of p.nodes) expect(ids.has(n.id), `brief ${p.id} node ${n.label} ${n.id}`).toBe(true);
  });

  it("skipped items are present but hidden", async () => {
    await postFeedback(req(`/api/users/sam/feedback?now=${encodeURIComponent(NOW)}`, { confId: "ptc-2026", targetId: "s-otel", kind: "skip" }), { params: { id: "sam" } });
    const { body } = await sky();
    expect(body.nodes.find((n) => n.id === "s-otel")?.state).toBe("skipped");
  });

  it("without confId covers every attended conference", async () => {
    const { status, body } = await sky("sam", null);
    expect(status).toBe(200);
    checkShape(body);
    const confs = body.nodes.filter((n) => n.type === "conference").map((n) => n.id).sort();
    expect(confs).toEqual(["ai-eng-summit-2026", "ptc-2026"]);
    expect(body.nodes.some((n) => n.id === "m-june-2" && n.conferenceId === "ai-eng-summit-2026")).toBe(true);
  });

  it("unknown user → 200 empty", async () => {
    const { status, body } = await sky("nobody");
    expect(status).toBe(200);
    expect(body).toEqual({ nodes: [], links: [], coverage: [] });
  });
});
