// Personal layer for the demo: Sam, Emily, Mike + generated attendees. Ids match mocks/index.ts.
// All personal data (goals, problems, MET, moments) is fictional.
import { q } from "@/lib/falkor";
import { writeEmbeddings } from "@/lib/agents/scout/upsert";
import { personId, topicId } from "@/lib/agents/scout/normalized";
import type { GoalKind, MomentKind, OpenTo } from "@/lib/types";
import { isoInZone, PT as PT_TZ } from "@/lib/time";

const CONF = "ptc-2026";
const JUNE = "ai-eng-summit-2026";
const T = (hhmm: string) => `2026-10-24T${hhmm}:00-07:00`;

interface SeedGoal { id: string; text: string; kind: GoalKind; weight: number; topics: string[] }
interface SeedMoment {
  id: string; kind: MomentKind; at: string; text?: string; shared?: boolean;
  targetId?: string; personId?: string; topics?: string[]; conferenceId?: string;
}
interface SeedUser {
  id: string; name: string; company?: string; title?: string; personId?: string; openTo: OpenTo[];
  goals: SeedGoal[]; problems?: { id: string; text: string; topics: string[] }[];
  attends: string[]; plans?: { targetId: string; goalId: string; status?: "planned" | "done" }[];
  moments?: SeedMoment[]; met?: { personId: string; at: string; conferenceId: string }[];
}

const sam: SeedUser = {
  id: "sam", name: "Sam Rivera", personId: "sam-rivera", openTo: ["job_hunting", "learning"], attends: [CONF, JUNE],
  goals: [
    { id: "g-tracing", text: "fix agent tracing for my team", kind: "learn", weight: 1, topics: ["agent tracing", "observability"] },
    { id: "g-infra", text: "meet AI infra people", kind: "meet", weight: 0.8, topics: ["ai infrastructure"] },
    { id: "g-role", text: "open to a new role", kind: "job", weight: 0.5, topics: ["hiring"] },
  ],
  problems: [{ id: "pr-tracing", text: "We can't see why our agents fail in production", topics: ["agent tracing", "observability"] }],
  moments: [
    // June: met Jake at his talk
    { id: "m-june-1", kind: "checkin", at: "2026-06-04T10:02:00-07:00", targetId: "aie-graph-memory", topics: ["agent memory"], conferenceId: JUNE },
    { id: "m-june-2", kind: "met", at: "2026-06-04T10:40:00-07:00", personId: "jake-morales@falkordb", text: "Jake, FalkorDB, after his graph memory talk", topics: ["agent memory"], conferenceId: JUNE },
    // Today
    { id: "m1", kind: "checkin", at: T("11:32"), targetId: "s-graphrag", topics: ["graphrag"] },
    { id: "m2", kind: "note", at: T("11:50"), shared: true, targetId: "s-graphrag", text: "Store tool calls as edges, not logs. Query the failure path.", topics: ["agent memory", "agent tracing"] },
    { id: "m4", kind: "note", at: T("11:58"), targetId: "s-graphrag", text: "shortestPath from the user request to the failed tool call = the debugger.", topics: ["agent tracing", "graphrag"] },
    { id: "m3", kind: "met", at: T("12:40"), personId: "mike-okafor@acmetrace", text: "Mike, Acme Trace, lunch", topics: ["agent tracing"] },
    { id: "m5", kind: "met", at: T("12:50"), personId: "emily-chen@tensorgrid", text: "Emily, TensorGrid, hiring infra engineers", topics: ["hiring", "ai infrastructure"] },
    { id: "m6", kind: "note", at: T("12:55"), text: "Acme Trace exports OTel spans; ask Mike about self-hosting.", topics: ["agent tracing", "opentelemetry"] },
  ],
  met: [
    { personId: "jake-morales@falkordb", at: "2026-06-04T10:40:00-07:00", conferenceId: JUNE },
    { personId: "mike-okafor@acmetrace", at: T("12:40"), conferenceId: CONF },
    { personId: "emily-chen@tensorgrid", at: T("12:50"), conferenceId: CONF },
  ],
};

const emily: SeedUser = {
  id: "emily", name: "Emily Chen", personId: "emily-chen@tensorgrid", company: "TensorGrid", title: "Engineering Manager",
  openTo: ["hiring"], attends: [CONF],
  goals: [{ id: "g-emily-hire", text: "hire AI infra engineers", kind: "hire", weight: 1, topics: ["ai infrastructure", "hiring"] }],
  plans: [
    { targetId: "s-graphrag", goalId: "g-emily-hire", status: "done" },
    { targetId: "s-tracing", goalId: "g-emily-hire", status: "done" },
    { targetId: "b-acme", goalId: "g-emily-hire" },
    { targetId: "s-infra", goalId: "g-emily-hire" },
  ],
  moments: [
    { id: "m-emily-1", kind: "checkin", at: T("11:31"), targetId: "s-graphrag", topics: ["graphrag"] },
    { id: "m-emily-2", kind: "checkin", at: T("13:02"), targetId: "s-tracing", topics: ["agent tracing"] },
    { id: "m-emily-3", kind: "note", at: T("13:15"), shared: true, targetId: "s-tracing", text: "Span per tool call; sample 100% of failed runs.", topics: ["agent tracing"] },
  ],
  met: [{ personId: "sam-rivera", at: T("12:50"), conferenceId: CONF }],
};

const mike: SeedUser = {
  id: "mike", name: "Mike Okafor", personId: "mike-okafor@acmetrace", company: "Acme Trace", title: "Software Engineer",
  openTo: [], attends: [CONF],
  goals: [{ id: "g-mike-users", text: "find teams with agent tracing pain", kind: "meet", weight: 1, topics: ["agent tracing"] }],
  plans: [{ targetId: "b-acme", goalId: "g-mike-users", status: "done" }],
  met: [{ personId: "sam-rivera", at: T("12:40"), conferenceId: CONF }],
};

// ---------- generated attendees (deterministic) ----------

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PEOPLE: [string, string, string][] = [
  ["Ana Lopez", "Northwind AI", "ML Engineer"], ["Ben Carter", "Parcel", "Backend Engineer"], ["Chloe Park", "Mosaic Health", "Staff Engineer"],
  ["Diego Santos", "Fieldline", "Platform Lead"], ["Eva Novak", "Quanta Labs", "Data Scientist"], ["Farah Haddad", "Brightpath", "Engineering Manager"],
  ["Gus Lindqvist", "Ledgerly", "SRE"], ["Hana Sato", "Kitebase", "AI Engineer"], ["Ivan Petrov", "Orbit CI", "DevOps Engineer"],
  ["Jo Mensah", "Seedling", "Founder"], ["Kai Wong", "Atlas Robotics", "Research Engineer"], ["Lia Rossi", "Copperleaf", "Product Engineer"],
];
const GOAL_POOL: { text: string; kind: GoalKind; topics: string[] }[] = [
  { text: "debug our agents in production", kind: "learn", topics: ["agent tracing", "observability"] },
  { text: "learn GraphRAG", kind: "learn", topics: ["graphrag", "agent memory"] },
  { text: "scale our inference stack", kind: "learn", topics: ["ai infrastructure", "inference"] },
  { text: "evaluate agents before release", kind: "learn", topics: ["agent evaluation", "testing"] },
  { text: "find a web data provider", kind: "buy", topics: ["web scraping", "web data"] },
  { text: "hire platform engineers", kind: "hire", topics: ["hiring", "ai infrastructure"] },
];
const NOTES: Record<string, string[]> = {
  "s-graphrag": ["Cypher path queries as the debugger.", "Paths beat chunks for multi-hop questions.", "Memory = nodes for facts, edges for tool calls."],
  "s-falkor-intro": ["Vector index lives next to the graph: one query for both.", "MERGE on id or you get duplicates."],
  "s-evals": ["Golden traces as regression tests.", "Run evals on every prompt change."],
  "s-tracing": ["Replay a failed run from its trace.", "Alert on tool-call error rate, not just latency."],
  "s-review": ["Review tool schemas like API contracts."],
};

function generated(sessions: { id: string; start: string; end: string; topics: string[] }[], booths: { id: string; topics: string[] }[]): SeedUser[] {
  const r = rng(42);
  const NOW = new Date(T("13:40")).getTime();
  const pick = <X,>(xs: X[]) => xs[Math.floor(r() * xs.length)];
  return PEOPLE.map(([name, company, title], i) => {
    const first = name.split(" ")[0].toLowerCase();
    const id = `u-${first}`;
    const g = i === 0 ? GOAL_POOL[1] : pick(GOAL_POOL);
    const goalId = `g-${first}-1`;
    const matches = sessions.filter((s) => s.topics.some((t) => g.topics.includes(t)));
    const extra = sessions.filter((s) => !matches.includes(s) && r() < 0.15);
    const planned = [...matches, ...extra].slice(0, 5);
    if (i === 0 && !planned.some((s) => s.id === "s-graphrag")) planned.unshift(sessions.find((s) => s.id === "s-graphrag")!);
    const boothPlans = booths.filter((b) => b.topics.some((t) => g.topics.includes(t))).slice(0, 2);
    const moments: SeedMoment[] = [];
    const plans: SeedUser["plans"] = [];
    for (const s of planned) {
      const past = new Date(s.end).getTime() < NOW;
      const attended = past && r() < 0.8;
      plans.push({ targetId: s.id, goalId, status: attended ? "done" : "planned" });
      if (!attended) continue;
      const start = new Date(s.start).getTime();
      moments.push({ id: `m-${first}-${moments.length + 1}`, kind: "checkin", at: isoInZone(new Date(start + (1 + Math.floor(r() * 4)) * 60_000), PT_TZ), targetId: s.id, topics: s.topics.slice(0, 1) });
      const notes = NOTES[s.id];
      if (notes && r() < 0.7) {
        // cluster around the middle of the session → hot moments
        const mid = start + (new Date(s.end).getTime() - start) / 2;
        moments.push({
          id: `m-${first}-${moments.length + 1}`, kind: "note", at: isoInZone(new Date(mid - 4 * 60_000 + Math.floor(r() * 8) * 60_000), PT_TZ),
          text: i === 0 && s.id === "s-graphrag" ? NOTES["s-graphrag"][0] : pick(notes), shared: r() < 0.75, targetId: s.id, topics: s.topics.slice(0, 2),
        });
      }
    }
    boothPlans.forEach((b) => plans.push({ targetId: b.id, goalId }));
    if (i === 0) moments.forEach((m) => { if (m.kind === "note" && m.targetId === "s-graphrag") { m.id = "m-x1"; m.at = T("11:52"); m.shared = true; } });
    return {
      id, name, company, title, openTo: g.kind === "hire" ? ["hiring"] : r() < 0.3 ? ["job_hunting"] : ["learning"],
      attends: [CONF], goals: [{ id: goalId, ...g, weight: 1 }], plans, moments,
    } satisfies SeedUser;
  });
}

// ---------- writer ----------

async function writeUser(u: SeedUser) {
  const pid = u.personId ?? personId(u.name, u.company);
  await q(
    `MERGE (u:User {id:$id}) SET u.name = $name, u.openTo = $openTo, u.personId = $pid
     MERGE (p:Person {id:$pid}) ON CREATE SET p.name = $name, p.title = $title, p.company = $company, p.via = 'user', p.source = 'conftellations', p.collectedAt = $now
     SET p.userId = $id, p.openTo = $openTo
     MERGE (u)-[:IS]->(p)
     WITH u UNWIND $attends AS cid MATCH (c:Conference {id:cid}) MERGE (u)-[:ATTENDS]->(c)`,
    { id: u.id, name: u.name, openTo: u.openTo, pid, title: u.title ?? null, company: u.company ?? null, attends: u.attends, now: "2026-10-24T16:00:00Z" },
  );
  if (u.company) {
    await q(
      `MATCH (p:Person {id:$pid})
       OPTIONAL MATCH (known:Company) WHERE toLower(known.name) = toLower($company)
       WITH p, known
       FOREACH (_ IN CASE WHEN known IS NULL THEN [1] ELSE [] END |
         MERGE (co:Company {id:$slug}) ON CREATE SET co.name = $company
         MERGE (p)-[:WORKS_AT]->(co))
       FOREACH (_ IN CASE WHEN known IS NULL THEN [] ELSE [1] END | MERGE (p)-[:WORKS_AT]->(known))`,
      { pid, company: u.company, slug: u.company.toLowerCase().replace(/[^a-z0-9]+/g, "-") },
    );
  }
  for (const g of u.goals) {
    await q(
      `MATCH (u:User {id:$uid}) MERGE (g:Goal {id:$id}) SET g.text = $text, g.kind = $kind, g.weight = $weight
       MERGE (u)-[:HAS_GOAL]->(g)
       WITH g UNWIND $topics AS tid MERGE (t:Topic {id:tid}) ON CREATE SET t.name = tid MERGE (g)-[:ABOUT]->(t)`,
      { uid: u.id, ...g, topics: g.topics.map(topicId) },
    );
  }
  for (const p of u.problems ?? []) {
    await q(
      `MATCH (u:User {id:$uid}) MERGE (pr:Problem {id:$id}) SET pr.text = $text
       MERGE (u)-[:HAS_PROBLEM]->(pr)
       WITH pr UNWIND $topics AS tid MERGE (t:Topic {id:tid}) ON CREATE SET t.name = tid MERGE (pr)-[:ABOUT]->(t)`,
      { uid: u.id, ...p, topics: p.topics.map(topicId) },
    );
  }
  for (const p of u.plans ?? []) {
    await q(
      `MATCH (u:User {id:$uid}), (x {id:$tid}) WHERE x:Session OR x:Booth OR x:Person
       MERGE (u)-[r:PLANS]->(x)
       SET r.goalId = $goalId, r.score = 1.0, r.status = $status, r.slotStart = x.start, r.slotEnd = x.end`,
      { uid: u.id, tid: p.targetId, goalId: p.goalId, status: p.status ?? "planned" },
    );
  }
  for (const m of u.moments ?? []) {
    await q(
      `MATCH (u:User {id:$uid}), (c:Conference {id:$cid})
       MERGE (m:Moment {id:$id})
       SET m.kind = $kind, m.at = $at, m.text = $text, m.shared = $shared, m.userId = $uid, m.conferenceId = $cid
       MERGE (u)-[:CAPTURED]->(m)
       MERGE (m)-[:DURING]->(c)
       WITH m
       OPTIONAL MATCH (x {id:$targetId}) WHERE x:Session OR x:Booth
       FOREACH (_ IN CASE WHEN x IS NULL THEN [] ELSE [1] END | MERGE (m)-[:AT]->(x))
       WITH m
       OPTIONAL MATCH (p:Person {id:$personId})
       FOREACH (_ IN CASE WHEN p IS NULL THEN [] ELSE [1] END | MERGE (m)-[:MET]->(p))
       WITH m UNWIND $topics AS tid MERGE (t:Topic {id:tid}) ON CREATE SET t.name = tid MERGE (m)-[:MENTIONS]->(t)`,
      {
        uid: u.id, cid: m.conferenceId ?? CONF, id: m.id, kind: m.kind, at: m.at, text: m.text ?? null, shared: m.shared ?? false,
        targetId: m.targetId ?? "", personId: m.personId ?? "", topics: (m.topics ?? []).map(topicId),
      },
    );
  }
  for (const m of u.met ?? []) {
    await q(`MATCH (u:User {id:$uid}), (p:Person {id:$pid}) MERGE (u)-[r:MET]->(p) SET r.at = $at, r.conferenceId = $cid`, {
      uid: u.id, pid: m.personId, at: m.at, cid: m.conferenceId,
    });
  }
}

export async function seedPersonal(ptc: { sessions: { id?: string; start: string; end: string; topics: string[] }[]; companies: { booth?: { id?: string }; topics: string[] }[] }) {
  const sessions = ptc.sessions.map((s) => ({ ...s, id: s.id!, topics: s.topics.map(topicId) }));
  const booths = ptc.companies.filter((c) => c.booth?.id).map((c) => ({ id: c.booth!.id!, topics: c.topics.map(topicId) }));
  const users = [sam, emily, mike, ...generated(sessions, booths)];
  for (const u of users) await writeUser(u);

  // pending meet request Sam → Emily (mocks.meetRequest)
  await q(
    `MATCH (a:User {id:'sam'}), (b:User {id:'emily'})
     MERGE (a)-[r:REQUESTED_MEET {id:'meet-1'}]->(b)
     SET r.note = $note, r.proposal = $proposal, r.status = 'pending', r.at = $at, r.conferenceId = $cid`,
    { note: "Catch up after Jake's talk?", proposal: JSON.stringify({ sessionId: "s-infra" }), at: T("13:40"), cid: CONF },
  );

  const goals = users.flatMap((u) => u.goals.map((g) => ({ id: g.id, text: `${g.text}. Topics: ${g.topics.join(", ")}` })));
  await writeEmbeddings("Goal", goals);
  await writeEmbeddings("Problem", users.flatMap((u) => (u.problems ?? []).map((p) => ({ id: p.id, text: `${p.text}. Topics: ${p.topics.join(", ")}` }))));
  return { users: users.length, moments: users.reduce((n, u) => n + (u.moments?.length ?? 0), 0) };
}
