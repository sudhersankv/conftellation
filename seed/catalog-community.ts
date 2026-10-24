// npx tsx seed/catalog-community.ts [--no-llm]
// Community layer for the session pages: at 3 sessions per past catalogue conference, plus the PTC sessions that had no
// crowd summary yet, 4-6 demo users check in (spread over the first minutes of the slot) and share a note (clustered
// around one key moment, so the 2-minute hot-moment bins peak), 1-2 also keep a private note. Then the crowd summary is
// stored per session (getCrowd) and briefs that already existed are recomputed for users who got new moments.
// All personal data is fictional; sessions are the real public ones. Idempotent: fixed moment ids (capture() treats a
// rerun as a retry), MERGE for ATTENDS, and getCrowd() reuses a stored summary while the shared notes are unchanged.
//
// Captures run with OPENAI_API_KEY unset so capture() doesn't spend one topic-tagging LLM call per note (topics come
// from the session); the notes are then embedded for real in one batch.
import "./env";
import { q } from "@/lib/falkor";
import { embed } from "@/lib/llm";
import { capture, scribeIdle } from "@/lib/agents/scribe";
import { precomputeRecaps } from "@/lib/agents/recapper";
import { getCrowd } from "@/lib/agents/recapper/crowd";
import { setMomentEmbedding } from "@/lib/queries/moments";
import { isoInZone, PT } from "@/lib/time";

type Line = [user: string, text: string];
interface Crowd { session: string; tag: string; notes: Line[]; private?: Line[] }

const sz = (code: string, n: string) => `sz-${code}-${n}`;
const kna = (uid: string) => `ics-kubecon-cloudnativecon-n-${uid}`;
const keu = (uid: string) => `ics-kubecon-cloudnativecon-e-${uid}`;

export const CROWDS: Crowd[] = [
  // ---------- AgntCon + MCPCon NA 2026 ----------
  {
    session: sz("asqam7rn", "1254998"), tag: "agntcon-mcpobs",
    notes: [
      ["emily", "Key line: \"the responder is now sometimes an agent\". Alert to trace to logs to dashboard should be one MCP hop each."],
      ["mike", "Shared auth and routing across MCP apps instead of one gateway per tool surface. That's the part everyone gets wrong."],
      ["u-ivan", "Demo went from a firing alert to the exact span in three tool calls, no copy-pasting trace ids between tabs."],
      ["u-gus", "Question from the floor: how do you rate-limit an agent that keeps re-querying logs? Answer: per-session budgets in the server."],
      ["u-kai", "Composable servers: one OpenSearch-backed MCP server, many thin apps on top that share the same conventions."],
    ],
    private: [["u-gus", "Try per-session query budgets on our internal MCP server before rollout."]],
  },
  {
    session: sz("asqam7rn", "1291876"), tag: "agntcon-evals",
    notes: [
      ["sam", "\"Vibes don't survive a prompt change.\" Every prompt edit should rerun the eval suite, same as a code change."],
      ["u-eva", "Start with 20-50 real failing traces as the golden set; synthetic cases come later."],
      ["u-chloe", "LLM-as-judge only after you've hand-labelled ~100 outputs and checked the judge agrees with you."],
      ["u-lia", "Score the trajectory, not just the final answer: wrong tool, right answer is still a regression."],
      ["u-ben", "Q&A: comparing models? Run both against the same eval set and look at per-case diffs, not the average."],
    ],
    private: [["sam", "Turn last month's failed agent runs into our first golden set."]],
  },
  {
    session: sz("asqam7rn", "1254678"), tag: "agntcon-graphrag",
    notes: [
      ["sam", "Retrieval found the right documents but missed the connection between them. That's the case for GraphRAG."],
      ["u-ana", "Entity extraction into a graph first, vector search second; the graph answers the multi-hop questions."],
      ["u-kai", "Graph memory: store who-did-what as edges so the agent can explain why it remembered something."],
      ["u-jo", "Stormtrooper storyline was great: each failure was a missing relationship, not a missing document."],
      ["emily", "Takeaway: model relationships explicitly; chunk size tuning won't fix a missing join."],
    ],
    private: [["u-ana", "Check if our docs pipeline can emit entities + relations alongside chunks."]],
  },
  // ---------- PyTorch Conference NA 2026 ----------
  {
    session: sz("0d2wfbyq", "1255975"), tag: "pytorch-cudagraph",
    notes: [
      ["u-kai", "Cudagraph profiles look bare: one big launch, no per-kernel detail. New tooling annotates replays with the captured ops."],
      ["u-eva", "On Blackwell, CPU launch overhead is the bottleneck; cudagraphs fix it but hide where time goes."],
      ["u-ivan", "Tip: tag graph capture regions with record_function so traces map back to model code."],
      ["u-hana", "Q&A: do the new annotations cost anything at replay? Answer: no, metadata is recorded at capture time."],
    ],
  },
  {
    session: sz("0d2wfbyq", "1301809"), tag: "pytorch-enterprise",
    notes: [
      ["mike", "24/7 enterprise serving needs four things pilots skip: reliability, observability, KV cache management, concurrency."],
      ["u-diego", "llm-d routes by prefix-cache hit; they claimed big TTFT wins for agent traffic with long shared system prompts."],
      ["u-farah", "Observability story: per-request spans through the router and vLLM so you can see queueing vs prefill vs decode."],
      ["u-kai", "Agentic workloads mean long-lived sessions; plan KV capacity for idle sessions, not just peak QPS."],
      ["emily", "Red Hat team is hiring for vLLM and llm-d; they said contributors with serving experience are hard to find."],
    ],
    private: [["u-diego", "Benchmark prefix-aware routing on our own traces before buying more GPUs."]],
  },
  {
    session: sz("0d2wfbyq", "1254938"), tag: "pytorch-kvcache",
    notes: [
      ["sam", "Agent sessions sit idle for hours but their KV cache still matters. Offload it instead of recomputing the prefix."],
      ["u-ana", "Tiers: GPU, then CPU memory, then local NVMe or shared storage; vLLM moves blocks between them natively now."],
      ["u-gus", "Same offloading path powers disaggregated prefill/decode: KV produced on one node, consumed on another."],
      ["u-eva", "Q&A: what's the restore cost from storage? Much cheaper than recomputing long prefixes, per their numbers."],
    ],
    private: [["sam", "Ask infra whether our agent sessions would fit a CPU-memory KV tier."]],
  },
  // ---------- KubeCon + CloudNativeCon NA 2025 ----------
  {
    session: kna("3340fdee1a14248be0afaa14b3c98213"), tag: "kcna25-multinode",
    notes: [
      ["sam", "600B+ models like DeepSeek-R1 don't fit one node; the unit of scaling becomes a group of pods, not a pod."],
      ["u-diego", "Day-2 ops: if one worker in a multi-node replica dies, restart the whole group. LeaderWorkerSet handles it."],
      ["u-kai", "Latency, cost and accuracy trade-offs measured per deployment shape; tensor + pipeline parallel across nodes."],
      ["u-ivan", "Network matters more than people think: they called out RDMA and topology-aware placement."],
      ["mike", "Question: how do you observe a request spread over 16 GPUs on two nodes? Answer: traces from the router down."],
    ],
    private: [["mike", "Follow up on multi-node request tracing; could be an Acme Trace use case."]],
  },
  {
    session: kna("71df3753f0a4b91a89304ccb97f58042"), tag: "kcna25-otel",
    notes: [
      ["sam", "2025 recap: profiles signal progressing, eBPF instrumentation donated, more of the spec marked stable."],
      ["mike", "GenAI semantic conventions are the one to watch for LLM and agent spans."],
      ["u-gus", "Collector: they want it stable by default, fewer footguns in the default config."],
      ["u-chloe", "Ask-the-experts tip: start with auto-instrumentation, then add manual spans only where the business logic is."],
      ["u-farah", "2026 focus: easier onboarding and better docs; they admitted getting started is still too hard."],
    ],
  },
  {
    session: kna("af6ab1fb57a2b55a9fd3d17ef6cef626"), tag: "kcna25-coldstart",
    notes: [
      ["u-diego", "Cold start breakdown: container pull, GPU driver init, model deserialization. The last one dominates for big models."],
      ["u-ana", "Fix list: pre-pulled images, snapshot the loaded model, keep a small warm pool instead of scaling to zero."],
      ["u-jo", "Milliseconds become minutes when a GPU node scales up from zero. Measure p99 including the scale-up."],
      ["u-ben", "Q&A: is scale-to-zero worth it for GPUs? Only for bursty, latency-tolerant traffic."],
    ],
    private: [["u-jo", "Our demo endpoint scales to zero; keep one warm replica during launches."]],
  },
  // ---------- KubeCon + CloudNativeCon Europe 2026 ----------
  {
    session: keu("ec4232b201cee092aa34c8f355a4f037"), tag: "kceu26-otel",
    notes: [
      ["sam", "Theme: OpenTelemetry stable by default. Fewer experimental flags, saner defaults out of the box."],
      ["mike", "Ask-the-experts: tail sampling belongs in a gateway collector tier, not in every agent sidecar."],
      ["u-ivan", "Declarative config for the SDKs is landing; one YAML instead of env vars per language."],
      ["u-hana", "Question on LLM spans: GenAI conventions cover model calls; agent and tool spans are still being shaped."],
      ["u-chloe", "Governance committee asked for more end-user feedback; the end-user SIG runs surveys."],
    ],
    private: [["u-ivan", "Move our tail sampling out of the app sidecars into a gateway collector."]],
  },
  {
    session: keu("6655d8392d0a5368bee480cbe1182626"), tag: "kceu26-routing",
    notes: [
      ["u-diego", "Expensive GPUs often serve simple queries; route batch, non-real-time and small-context requests to CPUs."],
      ["u-kai", "Three layers: classify the request, pick a model tier, then pick a backend. Each layer is swappable."],
      ["emily", "Telefonica showed real numbers: a big share of traffic never needed the large model."],
      ["u-eva", "Q&A: how do you avoid misrouting hard prompts? Fall back to the big model on low classifier confidence."],
    ],
  },
  {
    session: keu("779f63b3a4833fe4009a5100a1fe205b"), tag: "kceu26-keynote",
    notes: [
      ["sam", "\"The future of cloud native is agentic\": agents plus MCP servers to deploy, debug and operate instead of reading docs."],
      ["u-gus", "kagent demo: ask in plain language why a pod is crashing, the agent reads events and logs via MCP tools."],
      ["u-ana", "Security still needs least privilege for agents; agentgateway was the answer for tool authorization."],
      ["u-farah", "Vibe coding changed how we write software; this keynote argued operations is next."],
      ["mike", "Every agent action against the cluster should be traceable. Nobody on stage said how yet."],
    ],
  },
  // ---------- Patch the Conference (ptc-2026): sessions without a crowd summary ----------
  {
    session: "s-opening", tag: "ptc-opening",
    notes: [
      ["u-ben", "Problem statement: conferences are broken for attendees. Build for the person in the hallway, not the organizer."],
      ["u-jo", "Rules: demo at 17:30, judges from the sponsors, one winner per track."],
      ["u-lia", "Hint from the organizers: sponsor tools count for their track prizes, so use at least one."],
      ["u-farah", "Teams of up to four; you can still join one after the kickoff."],
    ],
  },
  {
    session: "s-falkor-intro", tag: "ptc-falkor",
    notes: [
      ["u-ivan", "Vector index lives next to the graph, so similarity search and a Cypher path query run in one round trip."],
      ["u-gus", "MERGE on a stable id or every re-import duplicates nodes. Learned that one the hard way."],
      ["u-chloe", "Vector score is a cosine distance in FalkorDB: lower means closer, sort ascending."],
      ["u-kai", "Model the why as relationships; then a named path query is the explanation you show users."],
    ],
    private: [["u-kai", "Try storing our tool-call logs as edges tonight."]],
  },
  {
    session: "s-evals", tag: "ptc-evals",
    notes: [
      ["u-diego", "Golden traces as regression tests: replay last week's real runs on every prompt change."],
      ["u-eva", "Offline evals catch most regressions before the canary does; keep the suite under ten minutes."],
      ["u-farah", "Sofia's rule: one eval per failure you've seen in production, named after the incident."],
      ["u-jo", "Question: how many cases is enough? Start with 50 that each broke something once."],
    ],
  },
  {
    session: "s-review", tag: "ptc-review",
    notes: [
      ["u-ben", "Review tool schemas like API contracts: a renamed field breaks every agent that calls it."],
      ["u-lia", "The bot flagged a retry loop without backoff in the demo PR. That's the agent bug humans miss."],
      ["u-gus", "Prompt changes show up as diffs in review now; treat them like config, with an owner."],
      ["u-hana", "Q&A: false positives? They tune it per repo and let reviewers dismiss with a reason."],
    ],
  },
  {
    session: "s-truefoundry", tag: "ptc-k8s",
    notes: [
      ["u-diego", "Agents and model servers deploy the same way: one manifest, autoscaling on queue depth, secrets from the vault."],
      ["u-ivan", "Rollbacks per model version saved them during a bad fine-tune release."],
      ["u-kai", "Scale agents on in-flight tasks, not CPU; agents mostly wait on model calls."],
      ["u-farah", "Arjun's tip: keep the model server and the agent in separate deployments so they scale independently."],
    ],
    private: [["u-ivan", "Check whether our HPA can scale on queue depth instead of CPU."]],
  },
  {
    session: "s-otel", tag: "ptc-otel",
    notes: [
      ["u-chloe", "GenAI semantic conventions: model, token counts and cost go on the span, prompts are opt-in."],
      ["u-gus", "Vendor tracers plug in as exporters; instrument once with OTel and switch backends later."],
      ["u-hana", "Token and cost metrics per agent step made the expensive step obvious in the demo."],
      ["u-eva", "Question: sampling for agents? Keep 100% of failed runs, sample the successful ones."],
    ],
  },
  {
    session: "s-scrape", tag: "ptc-webdata",
    notes: [
      ["u-jo", "Any public page as markdown in one call; the agent never sees the HTML soup."],
      ["u-ben", "Unblocking is the hard part: CAPTCHAs and geo-blocks handled by the unlocker, not your code."],
      ["u-lia", "Lena's advice: cache scrapes by URL and date so reruns cost nothing."],
      ["u-ana", "Fresh web data beats a stale index for agents that answer about events happening today."],
    ],
  },
  {
    session: "s-infra", tag: "ptc-infra",
    notes: [
      ["u-kai", "Continuous batching plus a prefix cache roughly doubled throughput on the same GPUs in Jake's numbers."],
      ["u-diego", "GPU utilisation under 40% usually means you're batching too little, not that you need fewer GPUs."],
      ["u-ana", "Agent workloads have long shared prompts; cache them and time-to-first-token drops a lot."],
      ["u-chloe", "Q&A: when to quantize? After batching and caching; quality cost is real for small models."],
    ],
  },
  {
    session: "s-gpu", tag: "ptc-gpu",
    notes: [
      ["u-ivan", "Bin-pack small models onto one GPU with fractional GPUs instead of one model per card."],
      ["u-farah", "Queue-based autoscaling reacts faster than GPU utilisation for bursty inference."],
      ["u-eva", "MIG vs time-slicing: MIG for isolation, time-slicing for dev clusters."],
      ["u-ben", "Arjun showed a cluster going from 9 GPUs to 4 for the same traffic after packing."],
    ],
    private: [["u-eva", "Ask platform team about MIG on the A100 pool."]],
  },
];

/**
 * Check-ins one per 2-minute bin over the first ~30% of the slot; shared notes all inside one 2-minute bin at ~55% of the
 * slot (the key moment), so the hot-moments chart has a clear peak there; private notes a few minutes later.
 */
function times(start: string, end: string) {
  const s = Date.parse(start);
  const dur = Math.max(Date.parse(end) - s, 6 * 60_000);
  const BIN = 2 * 60_000;
  const clamp = (t: number) => Math.min(Math.max(t, s + 20_000), s + dur - 20_000);
  const key = Math.floor((s + dur * 0.55) / BIN) * BIN + 10_000;
  const step = Math.max(BIN, Math.floor((dur * 0.3) / 6));
  return {
    checkin: (i: number) => new Date(clamp(s + 40_000 + i * step)).toISOString(),
    note: (i: number) => new Date(key + i * 15_000).toISOString(),
    privateNote: (i: number) => new Date(clamp(key + (3 + i) * BIN)).toISOString(),
  };
}

async function main() {
  const llm = !process.argv.includes("--no-llm");
  const ids = CROWDS.map((c) => c.session);
  const sessions = new Map(
    (await q<{ id: string; title: string; start: string; end: string; conf: string }>(
      `MATCH (c:Conference)-[:HAS_SESSION]->(s:Session) WHERE s.id IN $ids RETURN s.id AS id, s.title AS title, s.start AS start, s.end AS end, c.id AS conf`,
      { ids },
    )).map((r) => [r.id, r]),
  );
  const users = new Set((await q<{ id: string }>(`MATCH (u:User) RETURN u.id AS id`)).map((r) => r.id));
  const problems = [
    ...ids.filter((id) => !sessions.has(id)).map((id) => `session ${id}`),
    ...[...new Set(CROWDS.flatMap((c) => [...c.notes, ...(c.private ?? [])].map(([u]) => u)))].filter((u) => !users.has(u)).map((u) => `user ${u}`),
  ];
  if (problems.length) throw new Error(`missing: ${problems.join(", ")}`);

  // Briefs that exist now: recompute those whose owner gets new moments at that conference.
  const briefs = new Set((await q<{ k: string }>(`MATCH (s:Summary {kind:'brief'}) RETURN split(s.id, ':')[1] + '|' + s.conferenceId AS k`)).map((r) => r.k));
  const touched = new Set<string>();
  const had = new Set((await q<{ id: string }>(`MATCH (m:Moment) WHERE m.id STARTS WITH 'm-com-' RETURN m.id AS id`)).map((r) => r.id));

  const key = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY; // see header: no per-note tagging calls, fake embeddings replaced below
  const written: { id: string; text: string }[] = [];
  const when: { id: string; at: string }[] = [];
  let created = 0;
  try {
    for (const c of CROWDS) {
      const s = sessions.get(c.session)!;
      const at = new Set((await q<{ u: string }>(`MATCH (u:User)-[:CAPTURED]->(m:Moment)-[:AT]->(:Session {id:$id}) RETURN DISTINCT u.id AS u`, { id: s.id })).map((r) => r.u));
      const t = times(s.start, s.end);
      for (const [i, [user, text]] of c.notes.entries()) {
        await q(`MATCH (u:User {id:$u}), (c:Conference {id:$c}) MERGE (u)-[:ATTENDS]->(c)`, { u: user, c: s.conf });
        const base = `m-com-${c.tag}-${user}`;
        when.push({ id: `${base}-in`, at: t.checkin(i) }, { id: `${base}-note`, at: t.note(i) });
        if (!at.has(user)) {
          await capture({ userId: user, confId: s.conf, kind: "checkin", now: t.checkin(i), targetId: s.id, momentId: `${base}-in` });
        }
        const r = await capture({ userId: user, confId: s.conf, kind: "note", now: t.note(i), targetId: s.id, text, shared: true, momentId: `${base}-note` });
        if (had.has(r.moment.id)) continue;
        written.push({ id: r.moment.id, text });
        touched.add(`${user}|${s.conf}`);
      }
      for (const [i, [user, text]] of (c.private ?? []).entries()) {
        when.push({ id: `m-com-${c.tag}-${user}-private`, at: t.privateNote(i) });
        const r = await capture({ userId: user, confId: s.conf, kind: "note", now: t.privateNote(i), targetId: s.id, text, momentId: `m-com-${c.tag}-${user}-private` });
        if (!had.has(r.moment.id)) written.push({ id: r.moment.id, text });
      }
      created += c.notes.length + (c.private?.length ?? 0);
    }
    await scribeIdle();
  } finally {
    if (key) process.env.OPENAI_API_KEY = key;
  }

  // Keep stored times in line with the schedule above (a retried capture keeps its first time).
  await q(`UNWIND $rows AS r MATCH (m:Moment {id:r.id}) SET m.at = r.at, m.collectedAt = r.at`, { rows: when.map((w) => ({ id: w.id, at: isoInZone(new Date(w.at), PT) })) });

  // Real embeddings for the notes (one batched embeddings call, no chat LLM).
  const vecs = written.length ? await embed(written.map((w) => w.text)) : [];
  for (const [i, w] of written.entries()) await setMomentEmbedding(w.id, vecs[i]);
  console.log(`notes in script: ${created}, new + embedded: ${written.length}`);

  if (!llm) delete process.env.OPENAI_API_KEY;
  let crowdCalls = 0;
  for (const c of CROWDS) {
    const s = sessions.get(c.session)!;
    const before = Date.now();
    const crowd = await getCrowd({ id: s.id, title: s.title, conferenceId: s.conf });
    const fresh = crowd && Date.parse(crowd.updatedAt) >= before - 1000;
    if (fresh) crowdCalls++;
    console.log(`crowd ${s.conf} ${s.id}: ${crowd?.lines.length ?? 0} lines${fresh ? " (new)" : " (cached)"} cites=${crowd?.lines.map((l) => l.momentId).join(",")}`);
  }
  // Existing briefs, plus sam's (the demo user's record shows every conference he attended).
  const redo = [...touched].filter((k) => briefs.has(k) || k.startsWith("sam|"));
  for (const k of redo) {
    const [u, conf] = k.split("|");
    console.log(`recaps ${u} @ ${conf}: ${JSON.stringify(await precomputeRecaps(u, conf))}`);
  }
  console.log(`LLM calls (at most): crowd ${crowdCalls} + recaps ${redo.length * 2}`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
