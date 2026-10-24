import { beforeAll, describe, expect, it, vi } from "vitest";
import { GET as getSky } from "@/app/api/users/[id]/constellation/route";
import { GET as getPlan } from "@/app/api/users/[id]/plan/route";
import { POST as postMoment } from "@/app/api/users/[id]/moments/route";
import { POST as postFeedback } from "@/app/api/users/[id]/feedback/route";
import { GET as getBrief } from "@/app/api/users/[id]/brief/route";
import { capNodes, MAX_DUST_PER_CONF, MAX_NODES } from "@/lib/constellation";
import { q } from "@/lib/falkor";
import { MOMENT_LIMIT } from "@/lib/queries/constellation";
import type { BriefResponse, ConstellationResponse, CreateMomentResponse, PlanResponse, SkyNode } from "@/lib/types";
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
    expect(body.links).toContainEqual({ source: "sam", target: moment.id, type: "CAPTURED" });
  });

  it("a check-in on a planned session marks that star done", async () => {
    const res = await postMoment(new Request(`http://test/api/users/sam/moments?now=${encodeURIComponent(NOW)}`, { method: "POST", body: (() => { const f = new FormData(); f.append("confId", "ptc-2026"); f.append("kind", "checkin"); f.append("targetId", "s-tracing"); return f; })() }), { params: { id: "sam" } });
    expect(res.status).toBe(200);
    const { body } = await sky();
    expect(body.nodes.find((n) => n.id === "s-tracing")?.state).toBe("done");
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
    expect(body.nodes.find((n) => n.id === "jake-morales@falkordb")?.conferenceIds?.slice().sort()).toEqual(["ai-eng-summit-2026", "ptc-2026"]);
  });

  it("unknown user → 200 empty", async () => {
    const { status, body } = await sky("nobody");
    expect(status).toBe(200);
    expect(body).toEqual({ nodes: [], links: [], coverage: [] });
  });

  it("a conference the user does not attend is an empty sky", async () => {
    const { status, body } = await sky("emily", "ai-eng-summit-2026");
    expect(status).toBe(200);
    expect(body).toEqual({ nodes: [], links: [], coverage: [] });
  });

  it("a capture keeps a skipped target visible", async () => {
    await postFeedback(req(`/api/users/sam/feedback?now=${encodeURIComponent(NOW)}`, { confId: "ptc-2026", targetId: "s-evals", kind: "skip" }), { params: { id: "sam" } });
    const form = new FormData();
    form.append("confId", "ptc-2026");
    form.append("kind", "checkin");
    form.append("targetId", "s-evals");
    const res = await postMoment(new Request(`http://test/api/users/sam/moments?now=${encodeURIComponent(NOW)}`, { method: "POST", body: form }), { params: { id: "sam" } });
    expect(res.status).toBe(200);
    const { body } = await sky();
    expect(body.nodes.find((n) => n.id === "s-evals")?.state).not.toBe("skipped");
  });

  it("a person skip is per conference and does not erase the other plan", async () => {
    const before = await plan();
    expect(before.byGoal.some((g) => g.people.some((p) => p.id === "jake-morales@falkordb"))).toBe(true);
    const juneSkip = await postFeedback(req(`/api/users/sam/feedback?now=${encodeURIComponent(NOW)}`, { confId: "ai-eng-summit-2026", targetId: "jake-morales@falkordb", kind: "skip" }), { params: { id: "sam" } });
    expect(juneSkip.status).toBe(200);
    const afterJune = await plan();
    expect(afterJune.byGoal.some((g) => g.people.some((p) => p.id === "jake-morales@falkordb"))).toBe(true);

    const ptcSkip = await postFeedback(req(`/api/users/sam/feedback?now=${encodeURIComponent(NOW)}`, { confId: "ptc-2026", targetId: "jake-morales@falkordb", kind: "skip" }), { params: { id: "sam" } });
    expect(ptcSkip.status).toBe(200);
    const edges = await q<{ c: string }>(
      `MATCH (:User {id:'sam'})-[r:SKIPPED]->(:Person {id:'jake-morales@falkordb'}) RETURN r.conferenceId AS c`,
    );
    expect(edges.map((e) => e.c).sort()).toEqual(["ai-eng-summit-2026", "ptc-2026"]);
    expect((await sky()).body.nodes.find((n) => n.id === "jake-morales@falkordb")?.state).toBe("skipped");

    const boost = await postFeedback(req(`/api/users/sam/feedback?now=${encodeURIComponent(NOW)}`, { confId: "ptc-2026", targetId: "jake-morales@falkordb", kind: "boost" }), { params: { id: "sam" } });
    expect(boost.status).toBe(200);
    const left = await q<{ c: string }>(
      `MATCH (:User {id:'sam'})-[r:SKIPPED]->(:Person {id:'jake-morales@falkordb'}) RETURN r.conferenceId AS c`,
    );
    expect(left.map((e) => e.c)).toEqual(["ai-eng-summit-2026"]);
  });

  it("a legacy skip with no conference still hides that star", async () => {
    await q(`MATCH (u:User {id:'sam'}), (s:Session {id:'s-scrape'}) MERGE (u)-[r:SKIPPED]->(s) SET r.conferenceId = null`);
    const { body } = await sky();
    expect(body.nodes.find((n) => n.id === "s-scrape")?.state).toBe("skipped");
  });

  it("a user with a capture but no attendance is not an other-user star", async () => {
    await q(
      `MERGE (o:User {id:'ghost'}) SET o.name = 'Ghost'
       WITH o MATCH (s:Session {id:'s-graphrag'})
       MERGE (m:Moment {id:'m-ghost'})
       SET m.kind = 'checkin', m.at = '2026-10-24T11:40:00-07:00', m.conferenceId = 'ptc-2026'
       MERGE (o)-[:CAPTURED]->(m)-[:AT]->(s)`,
    );
    const { body } = await sky();
    expect(body.nodes.some((n) => n.id === "ghost")).toBe(false);
    expect(body.nodes.some((n) => n.isOtherUser)).toBe(true);
  });

  it("keeps a capture older than 200 when the sky still has room", async () => {
    expect(MOMENT_LIMIT).toBeGreaterThanOrEqual(MAX_NODES);
    const rows = Array.from({ length: 201 }, (_, i) => ({ id: `m-bulk-${i}`, at: new Date(Date.UTC(2020, 0, 1, 0, 0, i)).toISOString() }));
    await q(
      `MATCH (u:User {id:'sam'})
       UNWIND $rows AS row
       MERGE (m:Moment {id:row.id})
       SET m.kind = 'note', m.at = row.at, m.text = 'old', m.conferenceId = 'ptc-2026', m.userId = 'sam'
       MERGE (u)-[:CAPTURED]->(m)`,
      { rows },
    );
    const { body } = await sky();
    expect(body.nodes.some((n) => n.id === "m-bulk-0")).toBe(true);
    expect(body.nodes.length).toBeLessThanOrEqual(MAX_NODES);
  });

  it("drops dust before captures when the sky is over the cap", () => {
    const tier = new Map<string, number>([["m-keep", 0]]);
    const nodes: SkyNode[] = [
      { id: "m-keep", type: "moment", label: "note", state: "done", conferenceId: "ptc-2026" },
      ...Array.from({ length: MAX_NODES }, (_, i) => {
        tier.set(`d${i}`, 5);
        return { id: `d${i}`, type: "session" as const, label: "x", state: "dust" as const, conferenceId: "ptc-2026" };
      }),
    ];
    const out = capNodes(nodes, tier);
    expect(out).toHaveLength(MAX_NODES);
    expect(out.some((n) => n.id === "m-keep")).toBe(true);
  });

  it("coverage per goal matches the plan's byGoal (planned items, done ones covered)", async () => {
    const [{ body }, p] = await Promise.all([sky(), plan()]);
    for (const g of p.byGoal) {
      const items = new Map([...g.sessions, ...g.people, ...g.booths].map((i) => [i.id, i]));
      const c = body.coverage.find((x) => x.goalId === g.goal.id)!;
      expect(c, g.goal.id).toBeTruthy();
      expect(c.planned).toBe(items.size);
      expect(c.covered).toBe([...items.values()].filter((i) => i.status === "done").length);
      expect(c.covered).toBeLessThanOrEqual(c.planned);
    }
  });

  it("never includes another user's goals, problems or private captures (even via a stored path)", async () => {
    await q(
      `MATCH (u:User {id:'sam'})
       MERGE (s:Summary {id:'sum-privacy-test'})
       SET s.kind = 'brief', s.conferenceId = 'ptc-2026', s.json = $json
       MERGE (u)-[:HAS_SUMMARY]->(s)`,
      {
        json: JSON.stringify({
          paths: [{
            id: "px", text: "x",
            nodes: [
              { id: "emily", label: "User", name: "Emily Chen" }, { id: "g-emily-hire", label: "Goal", name: "hire" },
              { id: "m-emily-1", label: "Moment", name: "checkin" }, { id: "s-graphrag", label: "Session", name: "GraphRAG" },
            ],
            edges: [{ from: "emily", to: "g-emily-hire", type: "HAS_GOAL" }, { from: "m-emily-1", to: "s-graphrag", type: "AT" }],
          }],
        }),
      },
    );
    for (const confId of ["ptc-2026", null]) {
      const { body } = await sky("sam", confId);
      checkShape(body);
      const [own] = await q<{ goals: string[]; problems: string[]; moments: string[] }>(
        `MATCH (u:User {id:'sam'})
         OPTIONAL MATCH (u)-[:HAS_GOAL]->(g:Goal) WITH u, collect(g.id) AS goals
         OPTIONAL MATCH (u)-[:HAS_PROBLEM]->(p:Problem) WITH u, goals, collect(p.id) AS problems
         OPTIONAL MATCH (u)-[:CAPTURED]->(m:Moment) RETURN goals, problems, collect(m.id) AS moments`,
      );
      const shared = await q<{ id: string }>(`MATCH (m:Moment) WHERE m.shared = true RETURN m.id AS id`);
      const allowed = new Set([...own.goals, ...own.problems, ...own.moments, ...shared.map((m) => m.id)]);
      for (const n of body.nodes) {
        if (n.type === "goal" || n.type === "problem" || n.type === "moment") expect(allowed.has(n.id), `${n.type} ${n.id} is sam's`).toBe(true);
        if (n.type === "user" && n.id !== "sam") expect(n.isOtherUser, n.id).toBe(true);
      }
      expect(body.nodes.some((n) => n.id === "g-emily-hire" || n.id === "m-emily-1")).toBe(false);
    }
    await q(`MATCH (s:Summary {id:'sum-privacy-test'}) DETACH DELETE s`);
  });

  it("a check-in replays at the capture time, not the itinerary slot", async () => {
    const { body } = await sky();
    const n = body.nodes.find((x) => x.id === "s-tracing")!;
    const ats = await q<{ at: string }>(
      `MATCH (:User {id:'sam'})-[:CAPTURED]->(m:Moment {kind:'checkin'})-[:AT]->(:Session {id:'s-tracing'}) WHERE m.conferenceId = 'ptc-2026' RETURN m.at AS at`,
    );
    expect(ats.length).toBeGreaterThan(0);
    expect(n.at).toBe(ats.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0].at);
  });

  it("feedback is scoped to its conference: a target from another conference is rejected", async () => {
    const wrong = await postFeedback(req(`/api/users/sam/feedback`, { confId: "ai-eng-summit-2026", targetId: "s-tracing", kind: "skip" }), { params: { id: "sam" } });
    expect(wrong.status).toBe(404);
    const notAttending = await postFeedback(req(`/api/users/emily/feedback`, { confId: "ai-eng-summit-2026", targetId: "aie-graph-memory", kind: "skip" }), { params: { id: "emily" } });
    expect(notAttending.status).toBe(404);
    const edges = await q(`MATCH (:User {id:'sam'})-[r:SKIPPED]->(:Session {id:'s-tracing'}) RETURN r`);
    expect(edges).toHaveLength(0);
  });

  it("a person skipped at another conference is still planned here, and feedback at one conference keeps the other's", async () => {
    const jake = "jake-morales@falkordb";
    await q(`MATCH (:User {id:'sam'})-[r:SKIPPED|BOOSTED]->(:Person {id:$jake}) DELETE r`, { jake });
    const inPlan = (p: PlanResponse) => [...p.itinerary.map((s) => s.item), ...p.byGoal.flatMap((g) => g.people)].some((i) => i.id === jake);
    expect(inPlan(await plan()), "jake is a PTC candidate").toBe(true);

    const june = await postFeedback(req(`/api/users/sam/feedback`, { confId: "ai-eng-summit-2026", targetId: jake, kind: "skip" }), { params: { id: "sam" } });
    expect(june.status).toBe(200);
    expect(inPlan(await plan()), "a June skip does not hide jake at PTC").toBe(true);
    expect((await sky()).body.nodes.find((n) => n.id === jake)?.state).not.toBe("skipped");

    expect((await postFeedback(req(`/api/users/sam/feedback?now=${encodeURIComponent(NOW)}`, { confId: "ptc-2026", targetId: jake, kind: "skip" }), { params: { id: "sam" } })).status).toBe(200);
    expect((await postFeedback(req(`/api/users/sam/feedback`, { confId: "ai-eng-summit-2026", targetId: jake, kind: "boost" }), { params: { id: "sam" } })).status).toBe(200);
    const rows = await q<{ type: string; conf: string }>(
      `MATCH (:User {id:'sam'})-[r:SKIPPED|BOOSTED]->(:Person {id:$jake}) RETURN type(r) AS type, r.conferenceId AS conf`,
      { jake },
    );
    expect(rows.sort((a, b) => a.conf.localeCompare(b.conf))).toEqual([{ type: "BOOSTED", conf: "ai-eng-summit-2026" }, { type: "SKIPPED", conf: "ptc-2026" }]);
    expect(inPlan(await plan()), "skipped at PTC").toBe(false);
    expect((await sky()).body.nodes.find((n) => n.id === jake)?.state).toBe("skipped");
  });

  it("the cap keeps a capture together with its target and person", () => {
    const tier = new Map<string, number>([["m1", 0.1], ["m2", 0.2], ["t1", 0], ["p1", 0], ["t2", 0]]);
    const node = (id: string, type: SkyNode["type"]): SkyNode => ({ id, type, label: id, state: "done", conferenceId: "ptc-2026" });
    const list = [node("m1", "moment"), node("m2", "moment"), node("t1", "session"), node("p1", "person"), node("t2", "session")];
    const groups = new Map([["m1", ["t1", "p1"]], ["m2", ["t2"]]]);
    const out = capNodes(list, tier, 4, groups).map((n) => n.id);
    expect(out).toHaveLength(4);
    expect(out).toContain("m1");
    for (const id of out) if (groups.has(id)) for (const g of groups.get(id)!) expect(out, `${id} needs ${g}`).toContain(g);
    expect(out).not.toContain("m2");
  });
});
