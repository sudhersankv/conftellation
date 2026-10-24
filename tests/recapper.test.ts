import { beforeAll, describe, expect, it, vi } from "vitest";
import { GET as getBrief } from "@/app/api/users/[id]/brief/route";
import { GET as getTrip } from "@/app/api/users/[id]/trip-report/route";
import { q } from "@/lib/falkor";
import type { BriefResponse, TripReportResponse, WhyPath } from "@/lib/types";
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

const brief = async (user: string, qs = "confId=ptc-2026") => {
  const res = await getBrief(req(`/api/users/${user}/brief?${qs}`), { params: { id: user } });
  return { status: res.status, body: (await res.json()) as BriefResponse };
};
const trip = async (user: string, qs = "confId=ptc-2026") => {
  const res = await getTrip(req(`/api/users/${user}/trip-report?${qs}`), { params: { id: user } });
  return { status: res.status, body: (await res.json()) as TripReportResponse };
};

function expectRealPaths(paths: WhyPath[]) {
  expect(new Set(paths.map((p) => p.id)).size).toBe(paths.length);
  for (const p of paths) {
    expect(p.edges.length, p.id).toBeGreaterThan(0);
    const ids = new Set(p.nodes.map((n) => n.id));
    for (const e of p.edges) expect(ids.has(e.from) && ids.has(e.to), `${p.id} ${e.from}->${e.to}`).toBe(true);
  }
}
const cites = (b: BriefResponse) => b.sections.flatMap((s) => s.lines.map((l) => l.pathId));

describe("GET /api/users/:id/brief", () => {
  it("serves the seed-precomputed brief in DEMO_MODE; every line cites a real path", async () => {
    const { status, body } = await brief("sam");
    expect(status).toBe(200);
    expect(body.precomputed).toBe(true);
    expect(body.sections.map((s) => s.title)).toEqual(["What you learned", "Follow up with", "For your team's problem", "Seen before"]);
    const ids = new Set(body.paths.map((p) => p.id));
    for (const id of cites(body)) expect(ids.has(id)).toBe(true);
    expectRealPaths(body.paths);
    const nodeIds = body.paths.flatMap((p) => p.nodes.map((n) => n.id));
    expect(nodeIds).toEqual(expect.arrayContaining(["m2", "s-graphrag", "g-tracing", "mike-okafor@acmetrace", "b-acme", "pr-tracing", "jake-morales@falkordb"]));
  });

  it("regenerate=1 runs live, keeps only LLM lines citing known paths, and strips the citations", async () => {
    h.impl = () => ({
      sections: [
        { title: "What you learned", lines: ["Tool calls belong on edges, not in logs [p1].", "You loved every talk [p42].", "No citation at all."] },
        { title: "Follow up with", lines: ["Talk to Emily Chen about the infra role [p4]."] },
      ],
    });
    try {
      const { status, body } = await brief("sam", "confId=ptc-2026&regenerate=1");
      expect(status).toBe(200);
      expect(body.precomputed).toBe(false);
      expect(body.sections).toEqual([
        { title: "What you learned", lines: [{ text: "Tool calls belong on edges, not in logs.", pathId: "p1" }] },
        { title: "Follow up with", lines: [{ text: "Talk to Emily Chen about the infra role.", pathId: "p4" }] },
      ]);
      expect(body.paths.map((p) => p.id)).toEqual(["p1", "p4"]);
    } finally {
      h.impl = null;
    }
  });

  it("falls back to template sentences when the LLM fails, and is live outside DEMO_MODE", async () => {
    process.env.DEMO_MODE = "false";
    try {
      const { body } = await brief("sam");
      expect(body.precomputed).toBe(false);
      expect(cites(body).length).toBeGreaterThanOrEqual(5);
      expect(body.sections.flatMap((s) => s.lines).every((l) => !/\[p\d+\]/.test(l.text))).toBe(true);
    } finally {
      process.env.DEMO_MODE = "true";
    }
  });

  it("returns 200 with no sections for a user without check-ins or an unknown user; 400 without confId", async () => {
    for (const user of ["mike", "nobody"]) {
      const { status, body } = await brief(user);
      expect(status).toBe(200);
      expect(body.sections).toEqual([]);
      expect(body.paths).toEqual([]);
    }
    expect((await brief("sam", "")).status).toBe(400);
    expect((await brief("sam", "confId=ptc-2026&date=today")).status).toBe(400);
  });
});

describe("GET /api/users/:id/trip-report", () => {
  it("renders manager markdown from the same paths, without citation tokens", async () => {
    const { status, body } = await trip("sam");
    expect(status).toBe(200);
    expect(body.markdown).toMatch(/^# Trip report: Patch the Conference/);
    expect(body.markdown).toContain("## Vendors worth a follow-up");
    expect(body.markdown).toContain("Acme Trace");
    expect(body.markdown).not.toMatch(/\[p\d+\]/);
    expect(body.paths.length).toBeGreaterThan(3);
    expectRealPaths(body.paths);
  });

  it("is empty for an unknown user", async () => {
    const { status, body } = await trip("nobody");
    expect(status).toBe(200);
    expect(body).toEqual({ markdown: "", paths: [] });
  });

  it("empty regeneration replaces a stored brief and trip report", async () => {
    await q(
      `MATCH (u:User {id:'mike'})
       MERGE (b:Summary {id:'brief:mike:ptc-2026:all'})
       SET b.kind = 'brief', b.conferenceId = 'ptc-2026', b.generatedAt = '2000-01-01T00:00:00.000Z', b.json = $brief
       MERGE (u)-[:HAS_SUMMARY]->(b)
       MERGE (t:Summary {id:'trip:mike:ptc-2026:all'})
       SET t.kind = 'trip', t.conferenceId = 'ptc-2026', t.generatedAt = '2000-01-01T00:00:00.000Z', t.json = $trip
       MERGE (u)-[:HAS_SUMMARY]->(t)`,
      {
        brief: JSON.stringify({ sections: [{ title: "What you learned", lines: [{ text: "STALE", pathId: "p1" }] }], paths: [], generatedAt: "2000-01-01T00:00:00.000Z", precomputed: false }),
        trip: JSON.stringify({ markdown: "STALE REPORT", paths: [] }),
      },
    );
    const briefRegen = await brief("mike", "confId=ptc-2026&regenerate=1");
    expect(briefRegen.status).toBe(200);
    expect(briefRegen.body.sections).toEqual([]);
    expect(JSON.stringify(briefRegen.body)).not.toContain("STALE");
    const briefAgain = await brief("mike");
    expect(briefAgain.body.precomputed).toBe(true);
    expect(briefAgain.body.sections).toEqual([]);
    expect(JSON.stringify(briefAgain.body)).not.toContain("STALE");

    const tripRegen = await trip("mike", "confId=ptc-2026&regenerate=1");
    expect(tripRegen.body.paths).toEqual([]);
    expect(tripRegen.body.markdown).not.toContain("STALE");
    expect(tripRegen.body.markdown).toContain("Nothing captured yet");
    const tripAgain = await trip("mike");
    expect(tripAgain.body.paths).toEqual([]);
    expect(tripAgain.body.markdown).not.toContain("STALE");
  });

  it("regenerating for an unknown user clears a stale trip summary", async () => {
    await q(`MERGE (s:Summary {id:'trip:nobody:ptc-2026:all'}) SET s.json = $json`, {
      json: JSON.stringify({ markdown: "STALE", paths: [] }),
    });
    expect((await trip("nobody", "confId=ptc-2026&regenerate=1")).body).toEqual({ markdown: "", paths: [] });
    expect((await trip("nobody")).body).toEqual({ markdown: "", paths: [] });
  });
});
