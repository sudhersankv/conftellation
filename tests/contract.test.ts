import { describe, expect, it } from "vitest";
import * as mocks from "@/mocks";
import { GET as getPerson } from "@/app/api/people/[id]/route";

describe("mocks honour the contract", () => {
  it("every plan item that is a suggestion carries a why path", () => {
    for (const slot of mocks.plan.itinerary) {
      if (["session", "person", "booth"].includes(slot.item.type)) expect(slot.item.why.length).toBeGreaterThan(0);
    }
  });
  it("brief lines cite paths that exist", () => {
    const ids = new Set(mocks.brief.paths.map((p) => p.id));
    for (const s of mocks.brief.sections) for (const l of s.lines) expect(ids.has(l.pathId)).toBe(true);
  });
  it("constellation links point at existing nodes", () => {
    const ids = new Set(mocks.constellation.nodes.map((n) => n.id));
    for (const l of mocks.constellation.links) {
      expect(ids.has(l.source)).toBe(true);
      expect(ids.has(l.target)).toBe(true);
    }
  });
  it("person details are keyed by person id and carry a why", () => {
    for (const [id, d] of Object.entries(mocks.people)) {
      expect(d.person.id).toBe(id);
      expect(d.why.length).toBeGreaterThan(0);
    }
  });
  it("GET /api/people/:id serves the person or 404", async () => {
    const ok = await getPerson(new Request("http://t/api/people/x"), { params: { id: encodeURIComponent("jake-morales@falkordb") } });
    expect(ok.status).toBe(200);
    expect((await ok.json()).person.name).toBe("Jake Morales");
    const missing = await getPerson(new Request("http://t/api/people/x"), { params: { id: "nobody" } });
    expect(missing.status).toBe(404);
  });
  it("plan.now points at a known session or booth", () => {
    const ids = new Set([...mocks.sessions.map((s) => s.id), ...mocks.booths.map((b) => b.id)]);
    expect(ids.has(mocks.plan.now!.targetId)).toBe(true);
  });
});
