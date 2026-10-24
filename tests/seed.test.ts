import { beforeAll, describe, expect, it, vi } from "vitest";
import { q } from "@/lib/falkor";
import { upsertConference } from "@/lib/agents/scout/upsert";
import { loadPtc } from "@/seed/demo";
import * as mocks from "@/mocks";
import { seedOnce } from "./helpers";

vi.mock("@/lib/llm", async (orig) => (await import("./fakes")).fakeLlm(await orig()));

beforeAll(() => seedOnce(), 120_000);

describe("seed", () => {
  it("contains every id the mocks reference", async () => {
    const ids = [
      ...mocks.sessions.map((s) => s.id), ...mocks.booths.map((b) => b.id), ...mocks.goals.map((g) => g.id),
      "pr-tracing", "sam", "emily", "ptc-2026", "ai-eng-summit-2026", "jake-morales@falkordb", "mike-okafor@acmetrace", "emily-chen@tensorgrid",
      "acmetrace.dev", "falkordb.com", "m1", "m2", "m3", "u-ana",
    ];
    const found = await q<{ id: string }>(`MATCH (n) WHERE n.id IN $ids RETURN DISTINCT n.id AS id`, { ids });
    expect(found.map((r) => r.id).sort()).toEqual([...new Set(ids)].sort());
  });

  it("stamps provenance on scraped nodes and embeds them", async () => {
    const [r] = await q<{ missing: number }>(
      `MATCH (s:Session) WHERE s.source IS NULL OR s.collectedAt IS NULL OR s.via IS NULL OR s.embedding IS NULL RETURN count(s) AS missing`,
    );
    expect(r.missing).toBe(0);
  });

  it("is idempotent: re-upserting a conference creates no duplicates", async () => {
    const count = async () => (await q<{ n: number }>(`MATCH (n) RETURN count(n) AS n`))[0].n;
    const edges = async () => (await q<{ n: number }>(`MATCH ()-[r]->() RETURN count(r) AS n`))[0].n;
    const before = [await count(), await edges()];
    await upsertConference(loadPtc());
    expect([await count(), await edges()]).toEqual(before);
  });

  it("links one person across conferences (met before)", async () => {
    const rows = await q<{ conf: string }>(
      `MATCH (:User {id:'sam'})-[m:MET]->(p:Person {id:'jake-morales@falkordb'})-[:SPEAKS_AT]->(:Session)<-[:HAS_SESSION]-(c:Conference)
       RETURN DISTINCT c.id AS conf, m.conferenceId AS metAt`,
    );
    expect(rows.map((r) => r.conf).sort()).toEqual(["ai-eng-summit-2026", "ptc-2026"]);
  });
});
