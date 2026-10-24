import { describe, expect, it } from "vitest";
import * as mocks from "@/mocks";

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
});
