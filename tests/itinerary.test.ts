import { describe, expect, it } from "vitest";
import { buildItinerary, type ItineraryInput } from "@/lib/agents/planner/itinerary";

const T = (hhmm: string) => `2026-10-24T${hhmm}:00-07:00`;
const base = (over: Partial<ItineraryInput> = {}): ItineraryInput => ({
  day: { from: T("10:00"), to: T("17:00") },
  sessions: [
    { id: "a", start: T("11:30"), end: T("12:15"), score: 1.0 },
    { id: "b", start: T("11:30"), end: T("12:00"), score: 1.5 }, // clashes with a, higher score
    { id: "c", start: T("13:00"), end: T("13:30"), score: 2.0 },
    { id: "d", start: T("15:00"), end: T("15:30"), score: 0.8 },
  ],
  booths: [],
  ...over,
});
const ids = (slots: { id: string }[]) => slots.map((s) => s.id);

describe("itinerary builder", () => {
  it("resolves clashes greedily by score and orders by time", () => {
    expect(ids(buildItinerary(base()))).toEqual(["b", "c", "d"]);
  });

  it("keeps done and pinned sessions even when they clash with a better one", () => {
    const s = base().sessions.map((x) => (x.id === "a" ? { ...x, done: true } : x));
    expect(ids(buildItinerary(base({ sessions: s })))).toEqual(["a", "c", "d"]);
  });

  it("respects the time window (leaving at 3pm)", () => {
    expect(ids(buildItinerary(base({ window: { from: null, to: T("15:00") } })))).toEqual(["b", "c"]);
  });

  it("never schedules over a blocked time", () => {
    const slots = buildItinerary(base({ blocks: [{ from: T("12:45"), to: T("13:45"), label: "lunch" }] }));
    expect(ids(slots)).toEqual(["b", "block-0", "d"]);
  });

  it("fills gaps with top booths in walking order, sized by booth time", () => {
    const slots = buildItinerary({
      day: { from: T("11:00"), to: T("12:00") },
      sessions: [{ id: "s", start: T("11:20"), end: T("12:00"), score: 1 }],
      booths: [
        { id: "b14", score: 2, order: 14, hall: "Expo" },
        { id: "b2", score: 1, order: 2, hall: "Expo" },
        { id: "b9", score: 0, order: 9, hall: "Expo" }, // irrelevant, never placed
      ],
      boothMinutes: 10,
    });
    expect(slots.map((s) => [s.id, s.from])).toEqual([
      ["b2", T("11:00")],
      ["b14", T("11:10")],
      ["s", T("11:20")],
    ]);
  });

  it("only fills booths after now while the day is running", () => {
    const slots = buildItinerary({
      day: { from: T("11:00"), to: T("12:00") },
      now: T("11:25"),
      sessions: [{ id: "s", start: T("11:00"), end: T("11:20"), score: 1 }],
      booths: [{ id: "b1", score: 1, order: 1 }, { id: "b2", score: 1, order: 2 }],
      boothMinutes: 10,
    });
    expect(slots.map((s) => [s.id, s.from])).toEqual([["s", T("11:00")], ["b1", T("11:25")], ["b2", T("11:35")]]);
  });

  it("skips booths when gaps are shorter than the booth time", () => {
    const slots = buildItinerary({
      day: { from: T("11:00"), to: T("11:30") },
      sessions: [{ id: "s", start: T("11:05"), end: T("11:30"), score: 1 }],
      booths: [{ id: "b1", score: 1, order: 1 }],
      boothMinutes: 10,
    });
    expect(ids(slots)).toEqual(["s"]);
  });
});
