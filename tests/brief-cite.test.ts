import { describe, expect, it } from "vitest";
import { parseLine, parseSections } from "@/lib/agents/recapper/cite";

const ids = new Set(["p1", "p2", "p3"]);

describe("brief citation parser", () => {
  it("strips the citation and keeps its path id", () => {
    expect(parseLine("Store tool calls as edges [p1].", ids)).toEqual({ text: "Store tool calls as edges.", pathId: "p1" });
    expect(parseLine("Follow up with Mike. [p2]", ids)).toEqual({ text: "Follow up with Mike.", pathId: "p2" });
  });
  it("uses the last citation when a sentence cites several known paths", () => {
    expect(parseLine("Mike [p1] works at Acme Trace [p3].", ids)).toEqual({ text: "Mike works at Acme Trace.", pathId: "p3" });
  });
  it("rejects lines citing nothing or an unknown path", () => {
    expect(parseLine("Exciting day overall.", ids)).toBeNull();
    expect(parseLine("Jake is hiring [p9].", ids)).toBeNull();
    expect(parseLine("Mike [p1] and Jake [p9].", ids)).toBeNull();
    expect(parseLine("[p1]", ids)).toBeNull();
  });
  it("rejects a second sentence after a mid-line citation", () => {
    expect(parseLine("Known fact [p1]. Invented uncited sentence.", ids)).toBeNull();
    expect(parseLine("Known fact [p1] and then more.", ids)).toBeNull();
    expect(parseLine("Fact one [p1]. Fact two [p2].", ids)).toBeNull();
  });
  it("keeps a cited sentence that names dotted tech", () => {
    expect(parseLine("Meet the Next.js maintainers [p1].", ids)).toEqual({ text: "Meet the Next.js maintainers.", pathId: "p1" });
    expect(parseLine("Shipped v2.0 today [p2].", ids)).toEqual({ text: "Shipped v2.0 today.", pathId: "p2" });
    expect(parseLine("See e.g. the tracing talk [p3].", ids)).toEqual({ text: "See e.g. the tracing talk.", pathId: "p3" });
  });
  it("drops rejected lines and sections left empty", () => {
    const out = parseSections(
      [
        { title: "What you learned", lines: ["Edges beat logs [p1].", "Made up [p7]."] },
        { title: "Seen before", lines: ["No citation here."] },
      ],
      ids,
    );
    expect(out).toEqual([{ title: "What you learned", lines: [{ text: "Edges beat logs.", pathId: "p1" }] }]);
  });
  it("drops unknown and duplicate section titles", () => {
    const out = parseSections(
      [
        { title: "Invented heading", lines: ["Edges [p1]."] },
        { title: "Follow up with", lines: ["Talk to Mike [p2]."] },
        { title: "What you learned", lines: ["Edges beat logs [p1]."] },
        { title: "What you learned", lines: ["Duplicate [p3]."] },
      ],
      ids,
      ["What you learned", "Follow up with", "Seen before"],
    );
    expect(out).toEqual([
      { title: "What you learned", lines: [{ text: "Edges beat logs.", pathId: "p1" }] },
      { title: "Follow up with", lines: [{ text: "Talk to Mike.", pathId: "p2" }] },
    ]);
  });
});
