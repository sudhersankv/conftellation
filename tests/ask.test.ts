import { beforeAll, describe, expect, it, vi } from "vitest";
import { POST as postAsk } from "@/app/api/users/[id]/ask/route";
import type { AskResponse } from "@/lib/types";
import { req, seedOnce } from "./helpers";

// The fake model cites the first given path whose fact mentions a word of the question; otherwise it says so uncited.
vi.mock("@/lib/llm", async (orig) =>
  (await import("./fakes")).fakeLlm(await orig(), (_schema: unknown, _system: unknown, user: unknown) => {
    const { question, paths } = JSON.parse(String(user)) as { question: string; paths: { id: string; fact: string }[] };
    const words = question.toLowerCase().match(/[a-z]{5,}/g) ?? [];
    const hit = paths.find((p) => words.some((w) => p.fact.toLowerCase().includes(w)));
    return { sentences: hit ? [`${hit.fact.replace(/[.!?"]/g, "")} [${hit.id}].`, "You also won a prize [p999]."] : ["Your graph has nothing on pizza."] };
  }));
vi.mock("@/lib/brightdata", () => ({}));

beforeAll(() => seedOnce(), 180_000);

const ask = async (question: string, user = "sam") => {
  const res = await postAsk(req(`/api/users/${user}/ask`, { confId: "ptc-2026", question }), { params: { id: user } });
  return { status: res.status, body: (await res.json()) as AskResponse };
};

describe("POST /api/users/:id/ask", () => {
  it("answers from a seeded path: every line cites a path in `paths`; unknown citations are dropped", async () => {
    const { status, body } = await ask("Who can help with agent tracing?");
    expect(status).toBe(200);
    expect(body.question).toBe("Who can help with agent tracing?");
    expect(body.lines.length, JSON.stringify(body)).toBeGreaterThanOrEqual(1);
    const ids = new Set(body.paths.map((p) => p.id));
    for (const l of body.lines) {
      expect(ids.has(l.pathId)).toBe(true);
      expect(l.text).not.toMatch(/\[p\d+\]/);
    }
    expect(body.lines.some((l) => l.pathId === "p999")).toBe(false);
    for (const p of body.paths) {
      expect(p.edges.length).toBeGreaterThan(0);
      const nodeIds = new Set(p.nodes.map((n) => n.id));
      for (const e of p.edges) expect(nodeIds.has(e.from) && nodeIds.has(e.to)).toBe(true);
    }
  });

  it("returns no lines and a summary when the paths don't answer it", async () => {
    const { status, body } = await ask("Where is the best pizza in Lisbon?");
    expect(status).toBe(200);
    expect(body.lines).toEqual([]);
    expect(body.summary).toBeTruthy();
  });

  it("validates the body", async () => {
    const res = await postAsk(req(`/api/users/sam/ask`, { confId: "ptc-2026", question: " " }), { params: { id: "sam" } });
    expect(res.status).toBe(400);
  });
});
