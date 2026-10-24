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
});
