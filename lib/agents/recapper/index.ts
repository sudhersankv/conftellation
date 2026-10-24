// Recapper: Q8 paths (Cypher) → facts → sentences. The LLM only words facts it is given and must cite each one;
// without a key (or on failure) the same facts become template sentences. DEMO_MODE serves stored Summary nodes.
import { z } from "zod";
import { hasLLM, structured } from "@/lib/llm";
import type { BriefResponse, BriefSection, TripReportResponse, WhyPath } from "@/lib/types";
import type { RawPath } from "@/lib/queries/plan";
import {
  beforePaths, briefHeader, deleteSummary, introPaths, meetPaths, metPaths, notePaths, problemPaths, readSummary, seenPaths, writeSummary,
} from "@/lib/queries/brief";
import { parseSections } from "./cite";

export const SECTIONS = { learned: "What you learned", follow: "Follow up with", problem: "For your team's problem", before: "Seen before" } as const;
type SectionKey = keyof typeof SECTIONS;
const CAP: Record<SectionKey, number> = { learned: 3, follow: 3, problem: 2, before: 2 };
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const LLM_TIMEOUT_MS = 12_000;

/** A path plus what the trip report needs to word it without re-querying. */
export interface Fact {
  section: SectionKey;
  path: WhyPath;
  kind: "note" | "seen" | "met" | "intro" | "meet" | "booth" | "before";
  person?: string; company?: string; booth?: string; topic?: string; problem?: string; note?: string; where?: string;
}

export interface RecapInput { userName: string; confName: string; facts: Fact[] }

const first = (name: string) => name.split(" ")[0];

/** Union of real paths that share nodes (e.g. m→x and m→t←g): nodes de-duplicated by id, edges concatenated. */
export function mergePaths(...ps: (RawPath | null | undefined)[]): RawPath {
  const nodes = new Map<string, RawPath["nodes"][number]>();
  const edges: RawPath["edges"] = [];
  const seen = new Set<string>();
  for (const p of ps) {
    if (!p) continue;
    p.nodes.forEach((n) => nodes.has(n.id) || nodes.set(n.id, n));
    for (const e of p.edges) {
      const k = `${e.from}|${e.type}|${e.to}`;
      if (!seen.has(k)) { seen.add(k); edges.push(e); }
    }
  }
  return { nodes: [...nodes.values()], edges };
}

const best = <R,>(rows: R[], key: (r: R) => string, score: (r: R) => number) => {
  const m = new Map<string, R>();
  for (const r of rows) { const k = key(r); const cur = m.get(k); if (!cur || score(r) > score(cur)) m.set(k, r); }
  return [...m.values()];
};

/** Q8 a–f → facts, capped per section, path ids p1..pN in section order. Null if the user doesn't exist. */
export async function gatherFacts(userId: string, confId: string, date: string | null = null): Promise<RecapInput | null> {
  const a = { userId, confId, date };
  const head = await briefHeader(a);
  if (!head) return null;
  const base = { userName: head.userName ?? userId, confName: head.confName ?? confId };
  if (!head.checkins) return { ...base, facts: [] };

  const [notes, seen, met, problems, intros, before, meets] = await Promise.all([
    notePaths(a), seenPaths(a), metPaths(a), problemPaths(a), introPaths(a), beforePaths(a), meetPaths(a),
  ]);
  const facts: (Omit<Fact, "path"> & { raw: RawPath; text: string; rank: number })[] = [];

  // (a) notes, best goal per moment; then sessions attended
  const noteRows = best(notes, (r) => r.momentId, (r) => r.weight ?? 0);
  for (const r of noteRows) {
    const where = r.targetTitle ? ` at '${r.targetTitle}'` : "";
    facts.push({
      section: "learned", kind: "note", note: r.text, where: r.targetTitle ?? undefined, topic: r.topic ?? undefined,
      raw: mergePaths(r.at_, r.goal ?? r.own),
      text: `You noted "${r.text}"${where}${r.goalText ? `, for your goal '${r.goalText}'` : ""}`,
      rank: 10 + (r.weight ?? 0) - Date.parse(r.at) / 1e14,
    });
  }
  const noted = new Set(noteRows.map((r) => r.at_?.nodes.at(-1)?.id).filter(Boolean));
  for (const r of best(seen, (r) => r.sessionId, (r) => r.weight).filter((r) => !noted.has(r.sessionId))) {
    facts.push({
      section: "learned", kind: "seen", where: r.title, topic: r.topic, raw: r.path,
      text: `You attended '${r.title}' on ${r.topic}, for your goal '${r.goalText}'`, rank: r.weight - Date.parse(r.at) / 1e14,
    });
  }

  // (c) people met, ranked by goal overlap; (d) warm intros; (f) accepted meets
  const metBy = new Map<string, { row: (typeof met)[number]; goals: Map<string, number>; goalPath: RawPath | null }>();
  for (const r of met) {
    const e = metBy.get(r.personId) ?? { row: r, goals: new Map(), goalPath: null };
    if (r.goalId) {
      if ((r.weight ?? 0) > Math.max(0, ...e.goals.values())) { e.goalPath = r.goal; e.row = r; }
      e.goals.set(r.goalId, r.weight ?? 1);
    }
    metBy.set(r.personId, e);
  }
  for (const { row: r, goals, goalPath } of metBy.values()) {
    const who = `${r.name}${r.company ? ` (${r.company})` : ""}`;
    const hiring = r.openTo?.includes("hiring") ? `; ${first(r.name)} is hiring` : "";
    facts.push({
      section: "follow", kind: "met", person: r.name, company: r.company ?? undefined, note: r.note ?? undefined,
      raw: mergePaths(r.met, goalPath),
      text: `Follow up with ${who}${r.note ? `: you noted "${r.note}"` : ""}${r.goalText ? `, for your goal '${r.goalText}'` : ""}${hiring}`,
      rank: [...goals.values()].reduce((s, w) => s + w, 0) + (hiring ? 0.3 : 0),
    });
  }
  for (const r of best(intros, (r) => r.personId, () => 0)) {
    facts.push({
      section: "follow", kind: "intro", person: r.name, topic: r.topic, raw: mergePaths(r.saw, r.speaks),
      text: `Ask ${r.viaName} for an intro to ${r.name}: they were at '${r.sawAt}', and ${first(r.name)} speaks on ${r.topic}, your team's problem`,
      rank: 0.5,
    });
  }
  for (const r of meets) {
    facts.push({ section: "follow", kind: "meet", person: r.otherName, raw: r.path, text: `You agreed to meet ${r.otherName}`, rank: 2 });
  }

  // (b) booths for each problem: met their staff > visited > topic count
  const boothBy = new Map<string, { row: (typeof problems)[number]; topics: Set<string>; staff: RawPath | null; visits: number }>();
  for (const r of problems) {
    const e = boothBy.get(r.boothId) ?? { row: r, topics: new Set<string>(), staff: null, visits: 0 };
    e.topics.add(r.topic);
    if (r.staff && !e.staff) { e.staff = r.staff; e.row = r; }
    e.visits = Math.max(e.visits, r.visits);
    boothBy.set(r.boothId, e);
  }
  for (const { row: r, topics, staff, visits } of boothBy.values()) {
    facts.push({
      section: "problem", kind: "booth", company: r.company, booth: r.boothLabel, topic: r.topic, problem: r.problemText,
      person: staff ? r.staffName ?? undefined : undefined, raw: mergePaths(r.offer, staff),
      text: `${r.company} (${r.boothLabel}) offers ${r.topic}, which fits "${r.problemText}"${staff ? `; you met ${r.staffName} from ${r.company}` : ""}`,
      rank: (staff ? 1 : 0) + (visits ? 0.5 : 0) + 0.1 * topics.size,
    });
  }

  // (e) met before, speaking here
  for (const r of best(before, (r) => r.personId, () => 0)) {
    facts.push({
      section: "before", kind: "before", person: r.name, raw: r.path,
      text: `You met ${r.name} at ${r.prevConf} in ${MONTH[new Date(r.metAt).getUTCMonth()]}; ${first(r.name)} speaks here on '${r.session}'`,
      rank: 1,
    });
  }

  let n = 0;
  const picked = (Object.keys(SECTIONS) as SectionKey[]).flatMap((k) =>
    facts.filter((f) => f.section === k).sort((x, y) => y.rank - x.rank).slice(0, CAP[k]));
  return {
    ...base,
    facts: picked.map(({ raw, text, rank: _rank, ...f }) => ({ ...f, path: { id: `p${++n}`, text, nodes: raw.nodes, edges: raw.edges } })),
  };
}

// ---------- brief ----------

/** Template brief: one sentence per fact, each citing its own path. */
export function templateBrief(facts: Fact[]): BriefSection[] {
  return (Object.keys(SECTIONS) as SectionKey[])
    .map((k) => ({ title: SECTIONS[k], lines: facts.filter((f) => f.section === k).map((f) => ({ text: `${f.path.text}.`, pathId: f.path.id })) }))
    .filter((s) => s.lines.length);
}

const LinesSchema = z.object({ sections: z.array(z.object({ title: z.string(), lines: z.array(z.string()) })) });

const BRIEF_SYSTEM = `You write a short end-of-day conference brief for one attendee, in the second person.
Use ONLY the facts given. Each fact has an id like p3. End every sentence with the id of the fact it came from, like [p3].
One sentence per fact at most, at most 22 words each: rewrite the fact plainly and shorter, don't copy it. Keep each fact in its section.
Keep names and session titles exact; never add a fact, place or time that is not in the given fact.
Sections, in order: "What you learned", "Follow up with" (say why), "For your team's problem", "Seen before". Omit a section with no facts.
No buzzwords, no adjectives like "exciting", no emoji.`;

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("llm timeout")), ms))]);

function factsPrompt(input: RecapInput) {
  return JSON.stringify({
    attendee: input.userName, conference: input.confName,
    sections: (Object.keys(SECTIONS) as SectionKey[]).map((k) => ({
      title: SECTIONS[k], facts: input.facts.filter((f) => f.section === k).map((f) => ({ id: f.path.id, fact: f.path.text })),
    })).filter((s) => s.facts.length),
  });
}

export async function writeBrief(input: RecapInput): Promise<BriefResponse> {
  const generatedAt = new Date().toISOString();
  if (!input.facts.length) return { sections: [], paths: [], generatedAt, precomputed: false };
  const valid = new Set(input.facts.map((f) => f.path.id));
  let sections = templateBrief(input.facts);
  if (hasLLM()) {
    try {
      const out = await withTimeout(structured(LinesSchema, BRIEF_SYSTEM, factsPrompt(input), "brief"), LLM_TIMEOUT_MS);
      const parsed = parseSections(out.sections, valid, Object.values(SECTIONS));
      if (parsed.length) sections = parsed;
    } catch (e) {
      console.warn("[recapper] brief LLM failed, using template:", (e as Error).message);
    }
  }
  const cited = new Set(sections.flatMap((s) => s.lines.map((l) => l.pathId)));
  return { sections, paths: input.facts.map((f) => f.path).filter((p) => cited.has(p.id)), generatedAt, precomputed: false };
}

// ---------- trip report ----------

const TRIP = ["Top takeaways", "Relevant to our work", "Vendors worth a follow-up", "Contacts", "Recommended next steps"] as const;

/** Template trip report sections (bullets cite paths so the LLM output can be validated the same way). */
export function templateTrip(facts: Fact[]): { title: string; lines: { text: string; pathId: string }[] }[] {
  const by = (pred: (f: Fact) => boolean, word: (f: Fact) => string) => facts.filter(pred).map((f) => ({ text: word(f), pathId: f.path.id }));
  const sections = [
    by((f) => f.kind === "note", (f) => `${f.note}${f.where ? ` (${f.where})` : ""}`)
      .concat(by((f) => f.kind === "seen", (f) => `Attended '${f.where}' on ${f.topic}`)),
    by((f) => f.kind === "booth", (f) => `${f.company} offers ${f.topic}, which fits "${f.problem}"`),
    by((f) => f.kind === "booth", (f) => `${f.company} (${f.booth}): ${f.topic}${f.person ? `, contact ${f.person}` : ""}`),
    by((f) => f.kind === "met" || f.kind === "before", (f) => [f.person, f.company].filter(Boolean).join(", ")),
    by((f) => f.kind === "met" || f.kind === "intro" || f.kind === "meet", (f) => f.path.text)
      .concat(by((f) => f.kind === "booth", (f) => `Trial ${f.company} on "${f.problem}"`)),
  ];
  return TRIP.map((title, i) => ({ title, lines: sections[i] })).filter((s) => s.lines.length);
}

const TRIP_SYSTEM = `You write a trip report for the attendee's manager, as short Markdown bullet text (no headings in bullets).
Use ONLY the facts given. Each fact has an id like p3. End every bullet with the id of the fact it came from, like [p3].
Sections, in order: ${TRIP.map((t) => `"${t}"`).join(", ")}. A fact may appear in several sections. Omit empty sections.
At most 4 bullets per section, at most 20 words each. Keep names and quotes exact. No buzzwords, no emoji.`;

export function renderTrip(confName: string, userName: string, sections: { title: string; lines: { text: string }[] }[]): string {
  const body = sections.map((s) => `## ${s.title}\n${s.lines.map((l) => `- ${l.text}`).join("\n")}`).join("\n\n");
  return `# Trip report: ${confName}\n\n_${userName}_\n\n${body || "Nothing captured yet."}\n`;
}

export async function writeTrip(input: RecapInput): Promise<TripReportResponse> {
  if (!input.facts.length) return { markdown: renderTrip(input.confName, input.userName, []), paths: [] };
  const valid = new Set(input.facts.map((f) => f.path.id));
  let sections = templateTrip(input.facts);
  if (hasLLM()) {
    try {
      const out = await withTimeout(structured(LinesSchema, TRIP_SYSTEM, factsPrompt(input), "trip_report"), LLM_TIMEOUT_MS);
      const parsed = parseSections(out.sections, valid, TRIP);
      if (parsed.length) sections = parsed;
    } catch (e) {
      console.warn("[recapper] trip LLM failed, using template:", (e as Error).message);
    }
  }
  const cited = new Set(sections.flatMap((s) => s.lines.map((l) => l.pathId)));
  return { markdown: renderTrip(input.confName, input.userName, sections), paths: input.facts.map((f) => f.path).filter((p) => cited.has(p.id)) };
}

// ---------- serving (DEMO_MODE precompute) ----------

const demoMode = () => process.env.DEMO_MODE === "true";
export const summaryId = (kind: "brief" | "trip", userId: string, confId: string, date: string | null) => `${kind}:${userId}:${confId}:${date ?? "all"}`;

async function store(kind: "brief" | "trip", userId: string, confId: string, date: string | null, body: unknown, generatedAt: string) {
  await writeSummary({ id: summaryId(kind, userId, confId, date), kind, ownerId: userId, conferenceId: confId, json: JSON.stringify(body), generatedAt });
}

export async function getBrief(userId: string, confId: string, opts: { date?: string | null; regenerate?: boolean } = {}): Promise<BriefResponse> {
  const date = opts.date ?? null;
  if (demoMode() && !opts.regenerate) {
    const s = await readSummary(summaryId("brief", userId, confId, date));
    if (s) return { ...(JSON.parse(s.json) as BriefResponse), precomputed: true };
  }
  const input = await gatherFacts(userId, confId, date);
  if (!input) {
    await deleteSummary(summaryId("brief", userId, confId, date));
    return { sections: [], paths: [], generatedAt: new Date().toISOString(), precomputed: false };
  }
  const brief = await writeBrief(input);
  await store("brief", userId, confId, date, brief, brief.generatedAt);
  return brief;
}

export async function getTripReport(userId: string, confId: string, opts: { regenerate?: boolean } = {}): Promise<TripReportResponse> {
  if (demoMode() && !opts.regenerate) {
    const s = await readSummary(summaryId("trip", userId, confId, null));
    if (s) return JSON.parse(s.json) as TripReportResponse;
  }
  const input = await gatherFacts(userId, confId);
  if (!input) {
    await deleteSummary(summaryId("trip", userId, confId, null));
    return { markdown: "", paths: [] };
  }
  const trip = await writeTrip(input);
  await store("trip", userId, confId, null, trip, new Date().toISOString());
  return trip;
}

/** Seed-time precompute for the demo: brief + trip report stored as Summary nodes. */
export async function precomputeRecaps(userId: string, confId: string) {
  const input = await gatherFacts(userId, confId);
  if (!input?.facts.length) return { brief: 0, trip: 0 };
  const [brief, trip] = await Promise.all([writeBrief(input), writeTrip(input)]);
  await store("brief", userId, confId, null, brief, brief.generatedAt);
  await store("trip", userId, confId, null, trip, new Date().toISOString());
  return { brief: brief.sections.reduce((s, x) => s + x.lines.length, 0), trip: trip.paths.length };
}
