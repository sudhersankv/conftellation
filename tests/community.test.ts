import { beforeAll, describe, expect, it, vi } from "vitest";
import { GET as getCommunity } from "@/app/api/sessions/[id]/community/route";
import { GET as getRecord } from "@/app/api/users/[id]/record/route";
import { hotMoments } from "@/lib/agents/recapper/crowd";
import { q } from "@/lib/falkor";
import type { CommunityResponse, RecordResponse } from "@/lib/types";
import { req, seedOnce } from "./helpers";

// hasLLM() is true in this file; structured() throws (→ template fallback) unless a test sets h.impl.
const h = vi.hoisted(() => ({ impl: null as null | ((...a: unknown[]) => unknown) }));
vi.mock("@/lib/llm", async (orig) =>
  (await import("./fakes")).fakeLlm(await orig(), (...a: unknown[]) => {
    if (!h.impl) throw new Error("no llm in this test");
    return h.impl(...a);
  }));
vi.mock("@/lib/brightdata", () => ({}));

beforeAll(() => {
  process.env.DEMO_MODE = "true";
  return seedOnce();
}, 180_000);

const community = async (sessionId: string, userId?: string) => {
  const res = await getCommunity(req(`/api/sessions/${sessionId}/community${userId ? `?userId=${userId}` : ""}`), { params: { id: sessionId } });
  return { status: res.status, body: (await res.json()) as CommunityResponse };
};
const record = async (userId: string) => {
  const res = await getRecord(req(`/api/users/${userId}/record`), { params: { id: userId } });
  return { status: res.status, body: (await res.json()) as RecordResponse };
};

describe("hot moments", () => {
  it("bins moment times into 2-minute PT bins with counts", () => {
    expect(hotMoments(["2026-10-24T11:51:30-07:00", "2026-10-24T11:50:00-07:00", "2026-10-24T18:52:10Z", "bad"])).toEqual([
      { binStart: "2026-10-24T11:50:00-07:00", count: 2 },
      { binStart: "2026-10-24T11:52:00-07:00", count: 1 },
    ]);
  });
});

describe("GET /api/sessions/:id/community", () => {
  it("honours userId: my moments separately, other users' shared notes with authors", async () => {
    const { status, body } = await community("s-graphrag", "sam");
    expect(status).toBe(200);
    expect(body.session.id).toBe("s-graphrag");
    expect(body.myMoments.map((m) => m.id)).toEqual(expect.arrayContaining(["m1", "m2", "m4"]));
    expect(body.myMoments.every((m) => m.userId === "sam" && m.targetId === "s-graphrag")).toBe(true);
    expect(body.sharedNotes.some((n) => n.userId === "sam")).toBe(false);
    const ana = body.sharedNotes.find((n) => n.id === "m-x1");
    expect(ana).toMatchObject({ author: "Ana Lopez", shared: true, text: "Cypher path queries as the debugger." });
    expect(body.sharedNotes.every((n) => n.shared)).toBe(true);
  });

  it("without userId: no myMoments, every shared note (incl. Sam's); crowd summary cites shared moments; hot moments count all", async () => {
    const { body } = await community("s-graphrag");
    expect(body.myMoments).toEqual([]);
    expect(body.sharedNotes.map((n) => n.id)).toEqual(expect.arrayContaining(["m2", "m-x1"]));
    const shared = new Set(body.sharedNotes.map((n) => n.id));
    expect(body.crowdSummary!.lines.length).toBeGreaterThan(0);
    for (const l of body.crowdSummary!.lines) expect(shared.has(l.momentId)).toBe(true);
    const [{ n }] = await q<{ n: number }>(`MATCH (:Session {id:'s-graphrag'})<-[:AT]-(m:Moment) RETURN count(m) AS n`);
    expect(body.hotMoments.reduce((s, b) => s + b.count, 0)).toBe(n);
    expect(body.hotMoments.every((b) => /T\d\d:\d[02468]:00-07:00$/.test(b.binStart))).toBe(true);
  });

  it("refreshes the crowd summary when a new note is shared, keeping only citations of real moments", async () => {
    await q(
      `MATCH (u:User {id:'emily'}), (s:Session {id:'s-graphrag'}), (c:Conference {id:'ptc-2026'})
       MERGE (m:Moment {id:'m-test-share'}) SET m.kind = 'note', m.at = '2026-10-24T11:55:00-07:00', m.text = 'Graphs make agent failures queryable.',
         m.shared = true, m.userId = 'emily', m.conferenceId = 'ptc-2026'
       MERGE (u)-[:CAPTURED]->(m) MERGE (m)-[:AT]->(s) MERGE (m)-[:DURING]->(c)`,
    );
    h.impl = () => ({ lines: ["Attendees saw graphs as a debugger [p1].", "Everyone loved it [p99].", "No citation."] });
    try {
      const { body } = await community("s-graphrag");
      expect(body.crowdSummary!.lines).toHaveLength(1);
      expect(body.crowdSummary!.lines[0].text).toBe("Attendees saw graphs as a debugger.");
      expect(body.sharedNotes.map((n) => n.id)).toContain(body.crowdSummary!.lines[0].momentId);
    } finally {
      h.impl = null;
    }
  });

  it("returns a null crowd summary for a session nobody shared on, and 404 for an unknown session", async () => {
    const [quiet] = await q<{ id: string }>(
      `MATCH (:Conference {id:'ptc-2026'})-[:HAS_SESSION]->(s:Session) WHERE NOT (s)<-[:AT]-(:Moment {shared:true}) RETURN s.id AS id LIMIT 1`,
    );
    const { status, body } = await community(quiet.id, "sam");
    expect(status).toBe(200);
    expect(body.crowdSummary).toBeNull();
    expect(body.sharedNotes).toEqual([]);
    expect((await community("s-nope")).status).toBe(404);
  });
});

describe("GET /api/users/:id/record", () => {
  it("lists the conferences Sam attends, newest first, with counts and recap flags", async () => {
    const { status, body } = await record("sam");
    expect(status).toBe(200);
    expect(body.user).toMatchObject({ id: "sam", name: "Sam Rivera" });
    expect(body.conferences.map((c) => c.conference.id)).toEqual(["ptc-2026", "ai-eng-summit-2026"]);
    const [ptc, june] = body.conferences;
    expect(ptc).toMatchObject({ sessions: 1, people: 2, moments: 6, hasBrief: true, hasTrip: true });
    expect(ptc.conference.name).toBe("Patch the Conference");
    expect(june).toMatchObject({ people: 1, moments: 2, hasBrief: false, hasTrip: false });
  });

  it("is 200 with no conferences for an unknown user", async () => {
    const { status, body } = await record("nobody");
    expect(status).toBe(200);
    expect(body).toEqual({ user: { id: "nobody", name: "nobody", openTo: [] }, conferences: [] });
  });
});
