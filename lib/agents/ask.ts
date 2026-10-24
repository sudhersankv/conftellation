// Ask the brain: GraphRAG Q&A over the user's graph at one conference. No conversation state.
// Retrieval = the brief's path set (gatherFacts) + vector hits for the question (sessions, companies, people here),
// each turned into a real WhyPath. The LLM only words those paths and must cite each sentence; uncited lines are dropped.
import { z } from "zod";
import { q } from "@/lib/falkor";
import { embedOne, hasLLM, structured } from "@/lib/llm";
import type { RawPath } from "@/lib/queries/plan";
import type { AskResponse, BriefLine, WhyPath } from "@/lib/types";
import { gatherFacts, mergePaths } from "./recapper";
import { parseLine } from "./recapper/cite";

const K = 5; // hits kept per label
const SCAN = 40; // vector candidates scanned before the conference filter
const LLM_TIMEOUT_MS = 12_000;
const NOTHING = "Your graph has nothing on that yet.";

interface Hit { id: string; name: string; score: number; best: RawPath | null; fallback: RawPath | null }

const nonEmpty = (p: RawPath | null | undefined): RawPath | null => (p && p.nodes?.length && p.edges?.length ? p : null);

/** `{nodes: [...], edges: [...]}` map literal for path variable `p` (null-safe when wrapped in CASE). */
const pathMap = (p: string) =>
  `{nodes: [n IN nodes(${p}) | {id:n.id, label:labels(n)[0], name:coalesce(n.name, n.title, n.text, n.label, n.id)}],
    edges: [r IN relationships(${p}) | {from:startNode(r).id, to:endNode(r).id, type:type(r)}]}`;
const optPath = (p: string) => `CASE WHEN ${p} IS NULL THEN null ELSE ${pathMap(p)} END`;

const vecLiteral = (v: number[]) => v.map((x) => (Number.isFinite(x) ? x : 0));

/** Sessions here nearest the question; path to a user goal/problem topic when one exists. */
async function sessions(v: number[], userId: string, confId: string): Promise<Hit[]> {
  return q<Hit>(
    `CALL db.idx.vector.queryNodes('Session', 'embedding', ${SCAN}, vecf32($v)) YIELD node, score
     MATCH (c:Conference {id:$confId})-[:HAS_SESSION]->(node)
     WITH c, node, score ORDER BY score LIMIT ${K}
     OPTIONAL MATCH bp = (node)-[:ABOUT]->(:Topic)<-[:ABOUT]-(g)<-[:HAS_GOAL|HAS_PROBLEM]-(:User {id:$userId})
     WITH c, node, score, collect(bp) AS bps
     MATCH fp = (c)-[:HAS_SESSION]->(node)
     WITH node, score, fp, CASE WHEN size(bps) > 0 THEN bps[0] ELSE null END AS bp
     RETURN node.id AS id, coalesce(node.title, node.id) AS name, score, ${optPath("bp")} AS best, ${pathMap("fp")} AS fallback
     ORDER BY score`,
    { v: vecLiteral(v), userId, confId },
  );
}

/** Companies sponsoring or with a booth here; path through an offered topic of a user goal/problem when one exists. */
async function companies(v: number[], userId: string, confId: string): Promise<Hit[]> {
  return q<Hit>(
    `CALL db.idx.vector.queryNodes('Company', 'embedding', ${SCAN}, vecf32($v)) YIELD node, score
     MATCH (c:Conference {id:$confId})
     OPTIONAL MATCH sp = (node)-[:SPONSORS]->(c)
     OPTIONAL MATCH hp = (node)-[:HAS_BOOTH]->(:Booth)<-[:HAS_BOOTH]-(c)
     WITH node, score, collect(sp) AS sps, collect(hp) AS hps WHERE size(sps) + size(hps) > 0
     WITH node, score, CASE WHEN size(sps) > 0 THEN sps[0] ELSE hps[0] END AS fp ORDER BY score LIMIT ${K}
     OPTIONAL MATCH bp = (node)-[:OFFERS]->(:Topic)<-[:ABOUT]-(g)<-[:HAS_GOAL|HAS_PROBLEM]-(:User {id:$userId})
     WITH node, score, fp, collect(bp) AS bps
     WITH node, score, fp, CASE WHEN size(bps) > 0 THEN bps[0] ELSE null END AS bp
     RETURN node.id AS id, coalesce(node.name, node.id) AS name, score, ${optPath("bp")} AS best, ${pathMap("fp")} AS fallback
     ORDER BY score`,
    { v: vecLiteral(v), userId, confId },
  );
}

/** People speaking here or working at a company present here. */
async function people(v: number[], confId: string): Promise<Hit[]> {
  return q<Hit>(
    `CALL db.idx.vector.queryNodes('Person', 'embedding', ${SCAN}, vecf32($v)) YIELD node, score
     MATCH (c:Conference {id:$confId})
     OPTIONAL MATCH sp = (node)-[:SPEAKS_AT]->(s:Session)<-[:HAS_SESSION]-(c)
     OPTIONAL MATCH wp = (node)-[:WORKS_AT]->(co:Company)
       WHERE (co)-[:SPONSORS]->(c) OR (co)-[:HAS_BOOTH]->(:Booth)<-[:HAS_BOOTH]-(c)
     WITH node, score, collect(sp) AS sps, collect(wp) AS wps WHERE size(sps) + size(wps) > 0
     WITH node, score, CASE WHEN size(sps) > 0 THEN sps[0] ELSE wps[0] END AS fp ORDER BY score LIMIT ${K}
     RETURN node.id AS id, coalesce(node.name, node.id) AS name, score, null AS best, ${pathMap("fp")} AS fallback
     ORDER BY score`,
    { v: vecLiteral(v), confId },
  );
}

const nm = (p: RawPath, label: string) => p.nodes.find((n) => n.label === label)?.name;

function hitText(kind: "session" | "company" | "person", h: Hit, p: RawPath, goalPath: boolean): string {
  const topic = nm(p, "Topic");
  const goal = p.nodes.find((n) => n.label === "Goal" || n.label === "Problem");
  const why = goal ? `${goal.label === "Problem" ? "your team's problem" : "your goal"} '${goal.name}'` : "";
  if (kind === "session") {
    return goalPath && topic ? `'${h.name}' is on ${topic}, which matches ${why}` : `'${h.name}' is a session at ${nm(p, "Conference") ?? "this conference"}`;
  }
  if (kind === "company") {
    if (goalPath && topic) return `${h.name} offers ${topic}, which matches ${why}`;
    const booth = nm(p, "Booth");
    return booth ? `${h.name} has ${booth} at ${nm(p, "Conference") ?? "this conference"}` : `${h.name} sponsors ${nm(p, "Conference") ?? "this conference"}`;
  }
  const session = nm(p, "Session");
  return session ? `${h.name} speaks at '${session}'` : `${h.name} works at ${nm(p, "Company") ?? "a company here"}`;
}

const AnswerSchema = z.object({ sentences: z.array(z.string()) });
const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("llm timeout")), ms))]);

const system = (user: string) => `Answer the question for ${user} in at most 4 sentences using ONLY the facts in the paths.
Each path has an id like p3. End every sentence with its path id like [p3].
If the paths don't answer it, say so in one sentence without a citation.
Return the sentences as a list, one sentence per item. Keep names and session titles exact. No buzzwords, no emoji.`;

/** Question-specific retrieval: vector hits at this conference, as WhyPaths numbered after `start`. */
export async function questionPaths(question: string, userId: string, confId: string, start: number): Promise<WhyPath[]> {
  const v = await embedOne(question);
  const [s, c, p] = await Promise.all([sessions(v, userId, confId), companies(v, userId, confId), people(v, confId)]);
  const out: WhyPath[] = [];
  let n = start;
  const push = (kind: "session" | "company" | "person", rows: Hit[]) => {
    for (const h of rows) {
      const best = nonEmpty(h.best);
      const raw = best ?? nonEmpty(h.fallback);
      if (!raw) continue;
      const path = mergePaths(raw);
      out.push({ id: `p${++n}`, text: hitText(kind, h, path, Boolean(best)), nodes: path.nodes, edges: path.edges });
    }
  };
  push("session", s);
  push("company", c);
  push("person", p);
  return out;
}

export async function ask(userId: string, confId: string, question: string): Promise<AskResponse> {
  const input = await gatherFacts(userId, confId);
  if (!input) return { question, lines: [], paths: [], summary: NOTHING };
  const brief = input.facts.map((f) => f.path);
  // Drop question paths that duplicate a brief path's node set.
  const seen = new Set(brief.map((p) => p.nodes.map((x) => x.id).sort().join("|")));
  const extra = (await questionPaths(question, userId, confId, brief.length)).filter((p) => {
    const k = p.nodes.map((x) => x.id).sort().join("|");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  // Renumber so ids stay p1..pN with no gaps.
  const all = [...brief, ...extra].map((p, i) => ({ ...p, id: `p${i + 1}` }));
  if (!all.length || !hasLLM()) return { question, lines: [], paths: [], summary: NOTHING };

  const valid = new Set(all.map((p) => p.id));
  let lines: BriefLine[] = [];
  let summary: string | undefined;
  try {
    const prompt = JSON.stringify({ attendee: input.userName, conference: input.confName, question, paths: all.map((p) => ({ id: p.id, fact: p.text })) });
    const out = await withTimeout(structured(AnswerSchema, system(input.userName), prompt, "ask"), LLM_TIMEOUT_MS);
    lines = out.sentences.slice(0, 4).map((s) => parseLine(s, valid)).filter((l): l is BriefLine => l !== null);
    if (!lines.length) summary = out.sentences.map((s) => s.trim()).find((s) => s && !/\[p\d+\]/.test(s)) ?? NOTHING;
  } catch (e) {
    console.warn("[ask] LLM failed:", (e as Error).message);
    summary = NOTHING;
  }
  if (!lines.length) return { question, lines: [], paths: [], summary: summary ?? NOTHING };
  const cited = new Set(lines.map((l) => l.pathId));
  return { question, lines, paths: all.filter((p) => cited.has(p.id)) };
}
