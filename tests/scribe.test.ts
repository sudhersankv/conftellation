import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { POST as postMoment } from "@/app/api/users/[id]/moments/route";
import { POST as postShare } from "@/app/api/moments/[id]/share/route";
import { GET as getUpload } from "@/app/api/uploads/[file]/route";
import { scribeIdle } from "@/lib/agents/scribe";
import { q } from "@/lib/falkor";
import { momentForm } from "@/lib/client";
import type { CreateMomentFields, CreateMomentResponse, Moment } from "@/lib/types";
import { req, seedOnce } from "./helpers";

vi.mock("@/lib/llm", async (orig) => (await import("./fakes")).fakeLlm(await orig()));
vi.mock("@/lib/brightdata", () => ({}));

const uploads = mkdtempSync(path.join(tmpdir(), "conft-uploads-"));
process.env.UPLOAD_DIR = uploads;
beforeAll(() => seedOnce(), 180_000);
afterAll(() => rmSync(uploads, { recursive: true, force: true }));

const T = (hhmm: string) => `2026-10-24T${hhmm}:00-07:00`;
const capture = async (fields: Omit<CreateMomentFields, "confId"> & { confId?: string }, opts: { user?: string; now?: string } = {}) => {
  const user = opts.user ?? "sam";
  const url = `/api/users/${user}/moments?now=${encodeURIComponent(opts.now ?? T("13:10"))}`;
  const res = await postMoment(new Request(`http://test${url}`, { method: "POST", body: momentForm({ confId: "ptc-2026", ...fields }) }), { params: { id: user } });
  return { status: res.status, body: (await res.json()) as CreateMomentResponse & { error?: string } };
};
const share = async (id: string, to: unknown) => {
  const res = await postShare(req(`/api/moments/${id}/share`, { to }), { params: { id } });
  return { status: res.status, body: (await res.json()) as Moment & { error?: string } };
};

describe("POST /api/users/:id/moments", () => {
  it("attaches an untargeted note to the planned session running now and returns lit ids fast", async () => {
    const t0 = Date.now();
    const { status, body } = await capture({ kind: "note", text: "Span per tool call; OpenTelemetry for agent tracing" });
    const elapsed = Date.now() - t0;
    expect(status, body.error).toBe(200);
    expect(elapsed).toBeLessThan(3000);
    expect(body.moment).toMatchObject({ userId: "sam", conferenceId: "ptc-2026", kind: "note", targetId: "s-tracing", shared: false, at: T("13:10") });
    expect(body.moment.targetTitle).toBeTruthy();
    expect(body.moment.topics).toContain("agent tracing");
    expect(body.moment.topics.length).toBeLessThanOrEqual(3);
    expect(body.lit).toEqual(expect.arrayContaining([body.moment.id, "s-tracing", "g-tracing"]));

    await scribeIdle();
    const [m] = await q<{ e: boolean }>(`MATCH (m:Moment {id:$id}) RETURN m.embedding IS NOT NULL AS e`, { id: body.moment.id });
    expect(m.e).toBe(true);
  });

  it("a check-in flips the PLANS edge to done; later notes attach to the check-in", async () => {
    const checkin = await capture({ kind: "checkin", targetId: "s-infra" }, { now: T("15:02") });
    expect(checkin.status, checkin.body.error).toBe(200);
    const [r] = await q<{ status: string }>(`MATCH (:User {id:'sam'})-[r:PLANS]->(:Session {id:'s-infra'}) RETURN r.status AS status`);
    expect(r.status).toBe("done");
    const note = await capture({ kind: "note", text: "batching matters" }, { now: T("15:10") });
    expect(note.body.moment.targetId).toBe("s-infra");
  });

  it("an unplanned target is still captured (it becomes an unplanned star)", async () => {
    const { status, body } = await capture({ kind: "checkin", targetId: "s-gpu" }, { now: T("14:05") });
    expect(status, body.error).toBe(200);
    expect(body.moment.targetId).toBe("s-gpu");
    expect(body.lit).toContain("s-gpu");
  });

  it("clientId makes retries idempotent", async () => {
    const a = await capture({ kind: "note", text: "retry me", clientId: "c-retry-1" });
    const b = await capture({ kind: "note", text: "retry me", clientId: "c-retry-1" });
    expect(a.body.moment.id).toBe("c-retry-1");
    expect(b.body.moment).toEqual(a.body.moment);
    const [n] = await q<{ n: number }>(`MATCH (:User {id:'sam'})-[:CAPTURED]->(m:Moment {id:'c-retry-1'}) RETURN count(m) AS n`);
    expect(n.n).toBe(1);
  });

  it("met someone new creates the Person and MET edges without clobbering met-before", async () => {
    const { status, body } = await capture({ kind: "met", newPersonName: "Rosa Diaz", newPersonCompany: "Acme Trace", text: "Rosa, Acme Trace PM" });
    expect(status, body.error).toBe(200);
    expect(body.moment.personId).toBe("rosa-diaz@acmetrace");
    expect(body.lit).toContain("rosa-diaz@acmetrace");
    const [p] = await q<{ co: string; met: number }>(
      `MATCH (p:Person {id:'rosa-diaz@acmetrace'})-[:WORKS_AT]->(co:Company) MATCH (:User {id:'sam'})-[r:MET]->(p) RETURN co.id AS co, count(r) AS met`,
    );
    expect(p).toMatchObject({ co: "acmetrace.dev", met: 1 });

    const jake = await capture({ kind: "met", personId: "jake-morales@falkordb" });
    expect(jake.status, jake.body.error).toBe(200);
    const edges = await q<{ c: string }>(`MATCH (:User {id:'sam'})-[r:MET]->(:Person {id:'jake-morales@falkordb'}) RETURN r.conferenceId AS c ORDER BY c`);
    expect(edges.map((e) => e.c)).toEqual(["ai-eng-summit-2026", "ptc-2026"]);
  });

  it("stores a photo and serves it back", async () => {
    const file = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], { type: "image/jpeg" });
    const { status, body } = await capture({ kind: "photo", file, targetId: "s-tracing" });
    expect(status, body.error).toBe(200);
    expect(body.moment.mediaUrl).toMatch(/^\/api\/uploads\/.+\.jpg$/);
    const name = body.moment.mediaUrl!.split("/").pop()!;
    const res = await getUpload(req(body.moment.mediaUrl!), { params: { file: name } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await res.arrayBuffer()).length).toBe(7);
  });

  it("rejects bad input", async () => {
    expect((await capture({ kind: "dance" as never })).status).toBe(400);
    expect((await capture({ kind: "note", text: "x" }, { user: "nobody" })).status).toBe(404);
    expect((await capture({ kind: "checkin" }, { now: T("08:00") })).status).toBe(400);
    expect((await capture({ kind: "checkin", targetId: "s-nope" })).status).toBe(404);
    expect((await capture({ kind: "met" })).status).toBe(400);
    expect((await capture({ kind: "note", text: "x", clientId: "bad id!" })).status).toBe(400);
  });
});

describe("POST /api/moments/:id/share", () => {
  it("shares with the network, with users, and back to private", async () => {
    const { body } = await capture({ kind: "note", text: "worth sharing" });
    const id = body.moment.id;
    expect((await share(id, "network")).body.shared).toBe(true);
    const [n] = await q<{ n: number }>(`MATCH (:Moment {id:$id}) RETURN 1 AS n`, { id });
    expect(n.n).toBe(1);
    expect((await share(id, [])).body.shared).toBe(false);
    expect((await share(id, ["emily"])).status).toBe(200);
    const [w] = await q<{ u: string }>(`MATCH (:Moment {id:$id})-[:SHARED_WITH]->(u:User) RETURN u.id AS u`, { id });
    expect(w.u).toBe("emily");
    expect((await share("m-nope", "network")).status).toBe(404);
    expect((await share(id, 42)).status).toBe(400);
  });
});
