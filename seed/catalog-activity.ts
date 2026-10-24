// npx tsx seed/catalog-activity.ts [--no-recaps]
// Past-conference history for the demo users at the catalogue conferences (scripts/catalog.ts): ATTENDS + goals + a plan
// via onboard() (with `now` inside the conference), then check-ins, notes and one MET with a real speaker via capture()
// (with `now` inside the real session slot), then precomputeRecaps(). All personal data is fictional; sessions and
// speakers are the real public ones. Idempotent: moment ids are fixed (capture MERGEs a retry onto the stored moment),
// onboard() reuses goals with the same text. Never wipes anything.
import "./env";
import { q } from "@/lib/falkor";
import { onboard } from "@/lib/agents/onboarding";
import { capture, scribeIdle } from "@/lib/agents/scribe";
import { precomputeRecaps } from "@/lib/agents/recapper";
import type { GoalKind, MomentKind, OpenTo } from "@/lib/types";

interface Cap { kind: MomentKind; at: string; target?: string; text?: string; shared?: boolean; person?: string }
interface Visit {
  user: string; conf: string; tag: string; now: string;
  /** Goal texts, in rank order (weights 1, 0.8, ...). An existing goal with the same text is reused (same id), so passing a
   *  user's current goals in their current order leaves the live ptc-2026 demo unchanged. */
  goals: { text: string; kind: GoalKind }[];
  caps: Cap[];
}

const SCHED = "schedule-2026"; // AgntCon + MCPCon North America 2026
const PYT = "pytorch-conference-2026";
const KNA25 = "kubecon-cloudnativecon-north-america-2025";
const KEU26 = "kubecon-cloudnativecon-europe-2026";
const sz = (code: string, n: string) => `sz-${code}-${n}`;
const ics = (prefix: string, uid: string) => `ics-kubecon-cloudnativecon-${prefix}-${uid}`;

const SAM_GOALS = [{ text: "fix agent tracing for my team", kind: "learn" as GoalKind }, { text: "meet AI infra people", kind: "meet" as GoalKind }];

export const VISITS: Visit[] = [
  // ---- AgntCon + MCPCon NA 2026 (San Francisco, Oct 22-23) ----
  {
    user: "sam", conf: SCHED, tag: "agntcon", now: "2026-10-23T09:30:00-07:00", goals: SAM_GOALS,
    caps: [
      { kind: "checkin", at: "2026-10-23T10:11:00-07:00", target: sz("asqam7rn", "1324171") },
      { kind: "checkin", at: "2026-10-23T10:46:00-07:00", target: sz("asqam7rn", "1304134") },
      { kind: "checkin", at: "2026-10-23T13:46:00-07:00", target: sz("asqam7rn", "1254998") },
      { kind: "note", at: "2026-10-23T13:58:00-07:00", target: sz("asqam7rn", "1254998"), shared: true, text: "One MCP server per backend, many agent apps on top: every tool call lands in the same OTel trace pipeline." },
      { kind: "met", at: "2026-10-23T14:12:00-07:00", target: sz("asqam7rn", "1254998"), person: "shenoy-pratik-gurudatt@awsopensearch", text: "Pratik, OpenSearch, after the MCP observability talk" },
      { kind: "note", at: "2026-10-23T14:16:00-07:00", text: "Ask Pratik whether OpenSearch trace analytics can group spans by agent run." },
    ],
  },
  {
    user: "u-hana", conf: SCHED, tag: "agntcon", now: "2026-10-22T09:00:00-07:00", goals: [{ text: "evaluate agents before release", kind: "learn" }],
    caps: [
      { kind: "checkin", at: "2026-10-22T10:37:00-07:00", target: sz("asqam7rn", "1291876") },
      { kind: "note", at: "2026-10-22T10:49:00-07:00", target: sz("asqam7rn", "1291876"), shared: true, text: "Vibe-testing isn't evals: keep golden traces and score every tool call, fail the build on regressions." },
      { kind: "met", at: "2026-10-22T11:02:00-07:00", target: sz("asqam7rn", "1291876"), person: "laurie-voss@arizeai", text: "Laurie, Arize, after the agent evals talk" },
      { kind: "checkin", at: "2026-10-22T17:16:00-07:00", target: sz("asqam7rn", "1254678") },
    ],
  },
  // ---- PyTorch Conference NA 2026 (San Jose, Oct 20-21) ----
  {
    user: "sam", conf: PYT, tag: "pytorch", now: "2026-10-20T13:00:00-07:00", goals: SAM_GOALS,
    caps: [
      { kind: "checkin", at: "2026-10-20T15:27:00-07:00", target: sz("0d2wfbyq", "1301809") },
      { kind: "note", at: "2026-10-20T15:41:00-07:00", target: sz("0d2wfbyq", "1301809"), shared: true, text: "vLLM + llm-d: route requests by KV-cache hit rate, not round robin. Agentic traffic makes prefix reuse the main win." },
      { kind: "met", at: "2026-10-20T15:52:00-07:00", target: sz("0d2wfbyq", "1301809"), person: "tyler-michael-smith@redhat", text: "Tyler, Red Hat, vLLM in production" },
      { kind: "checkin", at: "2026-10-20T16:21:00-07:00", target: sz("0d2wfbyq", "1255975") },
    ],
  },
  {
    user: "mike", conf: PYT, tag: "pytorch", now: "2026-10-20T14:00:00-07:00", goals: [{ text: "find teams with agent tracing pain", kind: "meet" }],
    caps: [
      { kind: "checkin", at: "2026-10-20T16:21:00-07:00", target: sz("0d2wfbyq", "1255975") },
      { kind: "note", at: "2026-10-20T16:27:00-07:00", target: sz("0d2wfbyq", "1255975"), text: "CUDA graph replays hide per-kernel spans; instrument at capture time. Possible Acme Trace integration." },
      { kind: "met", at: "2026-10-20T16:32:00-07:00", target: sz("0d2wfbyq", "1255975"), person: "driss-guessous@meta", text: "Driss, Meta, CUDA graph observability" },
      { kind: "checkin", at: "2026-10-20T17:31:00-07:00", target: sz("0d2wfbyq", "1253573") },
    ],
  },
  {
    user: "u-diego", conf: PYT, tag: "pytorch", now: "2026-10-20T13:30:00-07:00", goals: [{ text: "scale our inference stack", kind: "learn" }],
    caps: [
      { kind: "checkin", at: "2026-10-20T14:51:00-07:00", target: sz("0d2wfbyq", "1254938") },
      { kind: "note", at: "2026-10-20T15:04:00-07:00", target: sz("0d2wfbyq", "1254938"), shared: true, text: "Tiered KV cache: offload to CPU then storage before you buy more GPUs; disaggregated prefill reuses the same path." },
      { kind: "met", at: "2026-10-20T15:16:00-07:00", target: sz("0d2wfbyq", "1254938"), person: "or-ozeri@ibm", text: "Or, IBM, KV cache offloading in vLLM" },
    ],
  },
  // ---- KubeCon + CloudNativeCon NA 2025 (Atlanta, Nov 10-13 2025) ----
  {
    user: "emily", conf: KNA25, tag: "kcna25", now: "2025-11-12T09:00:00-05:00", goals: [{ text: "hire AI infra engineers", kind: "hire" }],
    caps: [
      { kind: "checkin", at: "2025-11-12T11:47:00-05:00", target: ics("n", "3340fdee1a14248be0afaa14b3c98213") },
      { kind: "note", at: "2025-11-12T12:02:00-05:00", target: ics("n", "3340fdee1a14248be0afaa14b3c98213"), shared: true, text: "LeaderWorkerSet treats a multi-node model replica as one unit; scale and restart it together." },
      { kind: "met", at: "2025-11-12T12:17:00-05:00", target: ics("n", "3340fdee1a14248be0afaa14b3c98213"), person: "jiaxin-shan@bytedance", text: "Jiaxin, ByteDance, multi-node inference" },
      { kind: "checkin", at: "2025-11-12T14:16:00-05:00", target: ics("n", "af6ab1fb57a2b55a9fd3d17ef6cef626") },
    ],
  },
  {
    user: "u-ivan", conf: KNA25, tag: "kcna25", now: "2025-11-11T13:00:00-05:00", goals: [{ text: "debug our agents in production", kind: "learn" }],
    caps: [
      { kind: "checkin", at: "2025-11-11T17:01:00-05:00", target: ics("n", "71df3753f0a4b91a89304ccb97f58042") },
      { kind: "note", at: "2025-11-11T17:14:00-05:00", target: ics("n", "71df3753f0a4b91a89304ccb97f58042"), shared: true, text: "OTel in 2026: profiles as a fourth signal, and GenAI semantic conventions for agent spans." },
      { kind: "met", at: "2025-11-11T17:32:00-05:00", target: ics("n", "71df3753f0a4b91a89304ccb97f58042"), person: "austin-parker@honeycombio", text: "Austin, Honeycomb, OpenTelemetry roadmap" },
      { kind: "checkin", at: "2025-11-12T15:01:00-05:00", target: ics("n", "6783cfc0eeea08a52c7541c7af34bce7") },
    ],
  },
  // ---- KubeCon + CloudNativeCon Europe 2026 (Amsterdam, Mar 23-26) ----
  {
    user: "u-gus", conf: KEU26, tag: "kceu26", now: "2026-03-24T09:00:00+01:00", goals: [{ text: "debug our agents in production", kind: "learn" }],
    caps: [
      { kind: "checkin", at: "2026-03-24T16:17:00+01:00", target: ics("e", "ec4232b201cee092aa34c8f355a4f037") },
      { kind: "note", at: "2026-03-24T16:31:00+01:00", target: ics("e", "ec4232b201cee092aa34c8f355a4f037"), shared: true, text: "Move tail sampling into a collector gateway tier and keep 100% of error traces." },
      { kind: "met", at: "2026-03-24T16:47:00+01:00", target: ics("e", "ec4232b201cee092aa34c8f355a4f037"), person: "juraci-paixao-krohling@ollygarden", text: "Juraci, OllyGarden, OTel ask-the-experts" },
      { kind: "checkin", at: "2026-03-24T17:01:00+01:00", target: ics("e", "e7e2be766446d088598ee8e0cb949437") },
    ],
  },
  {
    user: "u-ana", conf: KEU26, tag: "kceu26", now: "2026-03-24T09:00:00+01:00", goals: [{ text: "learn GraphRAG", kind: "learn" }, { text: "scale our inference stack", kind: "learn" }],
    caps: [
      { kind: "checkin", at: "2026-03-24T12:02:00+01:00", target: ics("e", "6655d8392d0a5368bee480cbe1182626") },
      { kind: "note", at: "2026-03-24T12:18:00+01:00", target: ics("e", "6655d8392d0a5368bee480cbe1182626"), text: "Gateway API inference extension: pick the model server by KV-cache locality and queue depth." },
      { kind: "met", at: "2026-03-24T12:33:00+01:00", target: ics("e", "6655d8392d0a5368bee480cbe1182626"), person: "antonio-berben@soloio", text: "Antonio, Solo.io, inference routing" },
      { kind: "checkin", at: "2026-03-25T11:46:00+01:00", target: ics("e", "0202dd57c9e544dc65204e8d8fb34dea") },
    ],
  },
];

async function main() {
  const recaps = !process.argv.includes("--no-recaps");
  // Check every id first so a typo can't leave a half-written visit.
  const want = [...new Set(VISITS.flatMap((v) => [v.user, v.conf, ...v.caps.flatMap((c) => [c.target, c.person].filter(Boolean) as string[])]))];
  const found = new Set((await q<{ id: string }>(`UNWIND $ids AS id MATCH (x {id:id}) RETURN DISTINCT x.id AS id`, { ids: want })).map((r) => r.id));
  const missing = want.filter((id) => !found.has(id));
  if (missing.length) throw new Error(`missing ids: ${missing.join(", ")}`);
  for (const v of VISITS) {
    const [u] = await q<{ name: string; openTo: OpenTo[] | null }>(`MATCH (u:User {id:$id}) RETURN u.name AS name, u.openTo AS openTo`, { id: v.user });
    if (!u) throw new Error(`demo user ${v.user} missing`);
    const ob = await onboard(v.user, { confId: v.conf, name: u.name, openTo: u.openTo ?? [], goals: v.goals, problems: [] }, v.now);
    const out: string[] = [];
    for (const [i, c] of v.caps.entries()) {
      const r = await capture({
        userId: v.user, confId: v.conf, kind: c.kind, now: c.at, text: c.text, targetId: c.target, personId: c.person,
        shared: c.shared ?? false, momentId: `m-cat-${v.tag}-${v.user}-${i + 1}`,
      });
      out.push(`${c.kind}${r.moment.targetId ? `@${r.moment.targetId.slice(-8)}` : ""}${r.moment.personId ? `->${r.moment.personId}` : ""}`);
    }
    await scribeIdle();
    const rc = recaps ? await precomputeRecaps(v.user, v.conf) : null;
    console.log(`${v.user} @ ${v.conf}: goals=${ob.goals.map((g) => g.id).join(",")} moments=[${out.join(" ")}] recaps=${JSON.stringify(rc)}`);
  }
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
