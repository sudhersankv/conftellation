// npm run smoke [-- baseUrl] [--keep] [--no-llm]
// End-to-end run of every API route against a running server, as two throwaway users
// (never Sam), then deletes those users' personal layer from the graph.
// Real LLM calls only in the brief/trip-report regeneration (skip with --no-llm).
import { config } from "dotenv";
config({ path: ".env.local" });
import { q } from "../lib/falkor";
import type {
  AddConferenceResponse, BriefResponse, CommunityResponse, ConferenceDetail, ConstellationResponse,
  CreateMomentResponse, IntrosResponse, MeetRequest, NetworkResponse, OnboardingResponse, PlanResponse,
  RecordResponse, SearchResponse, SteerResponse, TripReportResponse,
} from "../lib/types";

const args = process.argv.slice(2);
const BASE = (args.find((a) => a.startsWith("http")) ?? "http://localhost:3001").replace(/\/$/, "");
const KEEP = args.includes("--keep");
const LLM = !args.includes("--no-llm");
const CONF = "ptc-2026";
const NOW = "2026-10-24T13:05:00-07:00"; // inside s-tracing (13:00–13:30)
const stamp = Date.now().toString(36);
const A = `smoke-a-${stamp}`;
const B = `smoke-b-${stamp}`;

type Row = { name: string; ok: boolean; ms: number; note: string };
const rows: Row[] = [];
let failed = 0;

async function step<T>(name: string, run: () => Promise<T>, check?: (v: T) => string | void): Promise<T | undefined> {
  const t0 = Date.now();
  try {
    const v = await run();
    const problem = check?.(v);
    rows.push({ name, ok: !problem, ms: Date.now() - t0, note: problem ?? "" });
    if (problem) failed++;
    return v;
  } catch (e) {
    rows.push({ name, ok: false, ms: Date.now() - t0, note: e instanceof Error ? e.message : String(e) });
    failed++;
    return undefined;
  }
}

async function call<T>(path: string, init?: RequestInit & { expect?: number }): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  const expect = init?.expect ?? 200;
  if (res.status !== expect) throw new Error(`HTTP ${res.status} (expected ${expect}): ${text.slice(0, 160)}`);
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}
const post = (body: unknown, expect?: number): RequestInit & { expect?: number } => ({
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), expect,
});
const assert = (cond: unknown, msg: string) => (cond ? undefined : msg);
const hasWhy = (plan: PlanResponse) =>
  plan.itinerary.filter((s) => ["session", "person", "booth"].includes(s.item.type)).every((s) => s.item.why.length > 0);

async function main() {
  console.log(`smoke → ${BASE}  users ${A}, ${B}  llm=${LLM}`);

  // ---- shared layer
  const conf = await step("GET conference", () => call<ConferenceDetail>(`/api/conferences/${CONF}`),
    (c) => assert(c.sessions.length > 5 && c.booths.length > 0, `sessions=${c.sessions.length} booths=${c.booths.length}`));
  await step("GET conference 404", () => call(`/api/conferences/does-not-exist`, { expect: 404 }));
  if (conf) {
    await step("POST conferences (cached import, 0 credits)", () => call<AddConferenceResponse>("/api/conferences", post({ url: conf.conference.url })),
      (r) => assert(r.cached === true && r.counts.sessions > 0, `cached=${r.cached} sessions=${r.counts.sessions}`));
  }
  await step("POST conferences rejects private URL", () => call("/api/conferences", post({ url: "http://127.0.0.1:6379/" }, 400)));
  await step("GET search", () => call<SearchResponse>(`/api/search?confId=${CONF}&q=tracing`),
    (r) => assert(r.sessions.length + r.booths.length + r.people.length > 0, "no results for 'tracing'"));

  // ---- onboarding (creates the users)
  await step("POST onboarding A", () => call<OnboardingResponse>(`/api/users/${A}/onboarding?now=${NOW}`, post({
    confId: CONF, name: "Smoke A", openTo: ["learning", "job_hunting"],
    goals: [{ text: "fix agent tracing for my team", kind: "learn" }, { text: "meet AI infra people", kind: "meet" }],
    problems: ["we can't see why our agents fail in production"],
  })), (r) => assert(r.goals.length === 2 && r.problems.length === 1 && r.goals.every((g) => g.topics.length > 0), `goals=${r.goals.length} topics=${r.goals.map((g) => g.topics.length)}`));
  await step("POST onboarding B", () => call<OnboardingResponse>(`/api/users/${B}/onboarding?now=${NOW}`, post({
    confId: CONF, name: "Smoke B", openTo: ["hiring"],
    goals: [{ text: "learn about GraphRAG and agent memory", kind: "learn" }], problems: [],
  })), (r) => assert(r.goals.length === 1, `goals=${r.goals.length}`));
  await step("POST onboarding unknown conference → 404", () => call(`/api/users/${A}/onboarding`, post({ confId: "nope", goals: [], problems: [], openTo: [] }, 404)));

  // ---- plan
  const plan = await step("GET plan A", () => call<PlanResponse>(`/api/users/${A}/plan?confId=${CONF}&now=${NOW}`),
    (p) => assert(p.itinerary.length > 0 && p.byGoal.length === 2 && hasWhy(p) && p.now?.targetId,
      `slots=${p.itinerary.length} byGoal=${p.byGoal.length} why=${hasWhy(p)} now=${p.now?.targetId}`));
  await step("GET plan unknown user → 200 empty", () => call<PlanResponse>(`/api/users/nobody-${stamp}/plan?confId=${CONF}`),
    (p) => assert(Array.isArray(p.itinerary) && p.itinerary.length === 0, `slots=${p.itinerary?.length}`));

  // ---- steer: direct ops (no LLM), then undo, then text
  const steer = await step("POST steer ops (window → 15:00)", () => call<SteerResponse>(`/api/users/${A}/steer?now=${NOW}`, post({
    confId: CONF, text: "leaving at 3pm", ops: [{ op: "set_window", from: null, to: "2026-10-24T15:00:00-07:00" }],
  })), (s) => assert(s.ops.length === 1 && s.plan.itinerary.every((x) => x.to <= "2026-10-24T15:00:00-07:00") && Array.isArray(s.undo),
    `ops=${s.ops.length} late=${s.plan.itinerary.filter((x) => x.to > "2026-10-24T15:00:00-07:00").length} undo=${!!s.undo}`));
  if (steer?.undo) {
    await step("POST steer undo", () => call<SteerResponse>(`/api/users/${A}/steer?now=${NOW}`, post({ confId: CONF, text: "undo", ops: steer.undo })),
      (s) => assert(s.plan.itinerary.length >= (plan?.itinerary.length ?? 1), `slots after undo=${s.plan.itinerary.length} before=${plan?.itinerary.length}`));
  }
  if (LLM) {
    await step("POST steer text (LLM → ops)", () => call<SteerResponse>(`/api/users/${A}/steer?now=${NOW}`, post({ confId: CONF, text: "more tracing, less hiring, leaving at 4pm" })),
      (s) => assert(s.ops.length > 0 && s.summary, `ops=${s.ops.length} summary=${s.summary}`));
  }
  await step("POST steer nonsense → ops []", () => call<SteerResponse>(`/api/users/${A}/steer?now=${NOW}`, post({ confId: CONF, text: "", ops: [] })),
    (s) => assert(s.ops.length === 0 && s.summary.length > 0, "expected hint summary"));

  // ---- feedback
  await step("POST feedback skip", () => call<PlanResponse>(`/api/users/${A}/feedback?now=${NOW}`, post({ confId: CONF, targetId: "s-scrape", kind: "skip" })),
    (p) => assert(!p.itinerary.some((s) => s.item.id === "s-scrape"), "skipped session still planned"));
  await step("POST feedback boost", () => call<PlanResponse>(`/api/users/${A}/feedback?now=${NOW}`, post({ confId: CONF, targetId: "s-graphrag", kind: "boost" })),
    (p) => assert(p.itinerary.length > 0, "empty plan after boost"));

  // ---- capture (Scribe)
  await step("POST moment checkin", () => call<CreateMomentResponse>(`/api/users/${A}/moments?now=${NOW}`, post({ confId: CONF, kind: "checkin", targetId: "s-tracing" })),
    (m) => assert(m.moment.targetId === "s-tracing" && m.lit.length > 0, `target=${m.moment.targetId} lit=${m.lit.length}`));
  const note = await step("POST moment note (auto-attach by time)", () => call<CreateMomentResponse>(`/api/users/${A}/moments?now=${NOW}`, post({
    confId: CONF, kind: "note", text: "Span per tool call; sample at the agent boundary, not per token.", clientId: `smoke-note-${stamp}`,
  })), (m) => assert(m.moment.targetId === "s-tracing" && m.moment.id === `smoke-note-${stamp}`, `target=${m.moment.targetId} id=${m.moment.id}`));
  await step("POST moment note (same clientId is idempotent)", () => call<CreateMomentResponse>(`/api/users/${A}/moments?now=${NOW}`, post({
    confId: CONF, kind: "note", text: "retry", clientId: `smoke-note-${stamp}`,
  })), (m) => assert(m.moment.id === `smoke-note-${stamp}`, `id=${m.moment.id}`));
  await step("POST moment met (existing person)", () => call<CreateMomentResponse>(`/api/users/${A}/moments?now=${NOW}`, post({ confId: CONF, kind: "met", personId: "jake-morales@falkordb" })),
    (m) => assert(m.moment.personId === "jake-morales@falkordb", `personId=${m.moment.personId}`));
  await step("POST moment bad kind → 400", () => call(`/api/users/${A}/moments`, post({ confId: CONF, kind: "selfie" }, 400)));
  if (note) {
    await step("POST share note → network", () => call<CreateMomentResponse["moment"]>(`/api/moments/${note.moment.id}/share`, post({ to: "network" })),
      (m) => assert(m.shared === true, "shared=false"));
  }
  await step("GET community as A (my notes, own note not duplicated)", () => call<CommunityResponse>(`/api/sessions/s-tracing/community?userId=${A}`),
    (c) => assert(c.myMoments.length >= 2 && !c.sharedNotes.some((n) => n.id === `smoke-note-${stamp}`) && Array.isArray(c.hotMoments),
      `mine=${c.myMoments.length} shared=${c.sharedNotes.length}`));
  await step("GET community as B (sees A's shared note)", () => call<CommunityResponse>(`/api/sessions/s-tracing/community?userId=${B}`),
    (c) => assert(c.sharedNotes.some((n) => n.id === `smoke-note-${stamp}` && n.author === "Smoke A") && !JSON.stringify(c.sharedNotes).includes("retry"),
      `shared=${c.sharedNotes.map((n) => n.id).join(",")}`));
  await step("GET community 404", () => call(`/api/sessions/no-such-session/community`, { expect: 404 }));

  // ---- constellation
  await step("GET constellation A", () => call<ConstellationResponse>(`/api/users/${A}/constellation?confId=${CONF}`), (c) => {
    const ids = new Set(c.nodes.map((n) => n.id));
    const dangling = c.links.filter((l) => !ids.has(l.source) || !ids.has(l.target)).length;
    const goals = c.nodes.filter((n) => n.type === "goal").length;
    const lit = c.nodes.filter((n) => n.state === "done" || n.state === "unplanned").length;
    const foreignGoals = c.nodes.filter((n) => (n.type === "goal" || n.type === "problem") && n.isOtherUser).length;
    const mine = c.nodes.some((n) => n.id === A && n.type === "user"); // false if the route still serves the mock
    return assert(mine && dangling === 0 && goals >= 2 && lit > 0 && foreignGoals === 0 && c.coverage.length === goals,
      `mine=${mine} nodes=${c.nodes.length} dangling=${dangling} goals=${goals} lit=${lit} foreignGoals=${foreignGoals} coverage=${c.coverage.length}`);
  });
  await step("GET constellation all conferences", () => call<ConstellationResponse>(`/api/users/${A}/constellation`),
    (c) => assert(c.nodes.some((n) => n.type === "conference"), "no conference ring"));

  // ---- people, intros, network, meets
  await step("GET person (Jake)", () => call(`/api/people/${encodeURIComponent("jake-morales@falkordb")}?confId=${CONF}&userId=${A}`),
    (p: any) => assert(p.person?.id && Array.isArray(p.why), "shape"));
  await step("GET person 404", () => call(`/api/people/nobody-here`, { expect: 404 }));
  await step("GET intros A", () => call<IntrosResponse>(`/api/users/${A}/intros?confId=${CONF}`), (r) => assert(Array.isArray(r.intros), "shape"));
  await step("GET network A (sees B, no goal text leaks)", () => call<NetworkResponse>(`/api/users/${A}/network?confId=${CONF}`), (n) => {
    const b = n.users.find((u) => u.user.id === B);
    const leak = JSON.stringify(n).includes("GraphRAG and agent memory");
    return assert(b && !leak, `seesB=${!!b} leak=${leak} users=${n.users.length}`);
  });
  const meet = await step("POST meet A→B", () => call<MeetRequest>(`/api/users/${A}/meet`, post({ confId: CONF, toUserId: B, note: "coffee after Jake's talk?", proposal: { sessionId: "s-infra" } })),
    (m) => assert(m.status === "pending" && m.toUserId === B, `status=${m.status}`));
  if (meet) {
    await step("GET network B (incoming)", () => call<NetworkResponse>(`/api/users/${B}/network?confId=${CONF}`),
      (n) => assert(n.incoming.some((m) => m.id === meet.id), `incoming=${n.incoming.length}`));
    await step("POST respond accept", () => call<MeetRequest>(`/api/meets/${encodeURIComponent(meet.id)}/respond?now=${NOW}`, post({ action: "accept" })),
      (m) => assert(m.status === "accepted", `status=${m.status}`));
    await step("GET plan B has meet item", () => call<PlanResponse>(`/api/users/${B}/plan?confId=${CONF}&now=${NOW}`),
      (p) => assert(p.itinerary.some((s) => s.item.type === "meet"), `types=${[...new Set(p.itinerary.map((s) => s.item.type))]}`));
    await step("POST respond bad action → 400", () => call(`/api/meets/${encodeURIComponent(meet.id)}/respond`, post({ action: "ghost" }, 400)));
  }

  // ---- remember (Recapper)
  if (LLM) {
    await step("GET brief A (regenerate, live LLM)", () => call<BriefResponse>(`/api/users/${A}/brief?confId=${CONF}&regenerate=1`), (b) => {
      const ids = new Set(b.paths.map((p) => p.id));
      const lines = b.sections.flatMap((s) => s.lines);
      const bad = lines.filter((l) => !ids.has(l.pathId)).length;
      return assert(lines.length > 0 && bad === 0 && b.precomputed === false, `lines=${lines.length} badCites=${bad} precomputed=${b.precomputed}`);
    });
    await step("GET trip report A (regenerate)", () => call<TripReportResponse>(`/api/users/${A}/trip-report?confId=${CONF}&regenerate=1`),
      (t) => assert(t.markdown.startsWith("#") && t.markdown.length > 100, `len=${t.markdown.length}`));
  } else {
    await step("GET brief A (stored or empty)", () => call<BriefResponse>(`/api/users/${A}/brief?confId=${CONF}`), (b) => assert(Array.isArray(b.sections), "shape"));
  }
  await step("GET brief Sam (DEMO_MODE precomputed)", () => call<BriefResponse>(`/api/users/sam/brief?confId=${CONF}`),
    (b) => assert(b.sections.length > 0 && b.sections.flatMap((s) => s.lines).every((l) => b.paths.some((p) => p.id === l.pathId)), "sam brief empty or uncited"));
  await step("GET record A", () => call<RecordResponse>(`/api/users/${A}/record`),
    (r) => assert(r.conferences.some((c) => c.conference.id === CONF && c.moments >= 3), `confs=${r.conferences.map((c) => `${c.conference.id}:${c.moments}`)}`));

  // ---- report
  const w = Math.max(...rows.map((r) => r.name.length));
  for (const r of rows) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(w)}  ${String(r.ms).padStart(5)}ms  ${r.note}`);
  console.log(`\n${rows.length - failed}/${rows.length} passed`);
}

async function cleanup() {
  if (KEEP) return console.log(`--keep: left users ${A}, ${B} in the graph`);
  try {
    await q(
      `MATCH (u:User) WHERE u.id IN $ids
       OPTIONAL MATCH (u)-[:HAS_GOAL|HAS_PROBLEM|CAPTURED|STEERED|HAS_SUMMARY|IS]->(x)
       OPTIONAL MATCH (u)-[:ATTENDS]->(m:Meet)
       DETACH DELETE x, m, u`,
      { ids: [A, B] },
    );
    console.log(`cleaned up ${A}, ${B}`);
  } catch (e) {
    console.error("cleanup failed:", e instanceof Error ? e.message : e);
    failed++;
  }
}

main()
  .catch((e) => { console.error(e); failed++; })
  .finally(async () => { await cleanup(); process.exit(failed ? 1 : 0); });
