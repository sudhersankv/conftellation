// Person card (GET /people/:id) and search (GET /search): people first, name prefix + vector.
import { q } from "@/lib/falkor";
import { embedOne } from "@/lib/llm";
import type { PersonDetail, SearchResponse, WhyPath } from "@/lib/types";
import { fitWhy, toBooth, toPerson, toSession } from "@/lib/agents/planner";
import { boothsByIds, peopleByIds, personPaths, sessionsByIds } from "@/lib/queries/plan";
import { warmIntros } from "@/lib/queries/network";

const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const nameOf = (p: { nodes: { label: string; name: string }[] }, label: string) => p.nodes.find((n) => n.label === label)?.name ?? "";

export async function personDetail(id: string, opts: { confId?: string; userId?: string }): Promise<PersonDetail | null> {
  const [row] = await peopleByIds([id]);
  if (!row) return null;
  const sessionIds = await q<{ id: string }>(
    opts.confId
      ? `MATCH (:Person {id:$id})-[:SPEAKS_AT]->(s:Session)<-[:HAS_SESSION]-(:Conference {id:$confId}) RETURN s.id AS id`
      : `MATCH (:Person {id:$id})-[:SPEAKS_AT]->(s:Session) RETURN s.id AS id`,
    { id, confId: opts.confId ?? null },
  );
  const sessions = (await sessionsByIds(sessionIds.map((r) => r.id))).map(toSession).sort((a, b) => a.start.localeCompare(b.start));
  const detail: PersonDetail = { person: toPerson(row), sessions, why: [] };
  if (!opts.userId) return detail;

  const [met, warm, paths, goals] = await Promise.all([
    q<{ personId: string; prevConferenceId: string; conferenceName: string; metAt: string; nodes: WhyPath["nodes"]; edges: WhyPath["edges"] }>(
      `MATCH p = (u:User {id:$userId})-[m:MET]->(pp:Person {id:$id})
       WHERE $confId IS NULL OR m.conferenceId <> $confId
       MATCH (c:Conference {id:m.conferenceId})
       RETURN pp.id AS personId, c.id AS prevConferenceId, c.name AS conferenceName, m.at AS metAt,
              [n IN nodes(p) | {id:n.id, label:labels(n)[0], name:coalesce(n.name, n.title, n.id)}] AS nodes,
              [r IN relationships(p) | {from:startNode(r).id, to:endNode(r).id, type:type(r)}] AS edges`,
      { userId: opts.userId, id, confId: opts.confId ?? null },
    ),
    opts.confId ? warmIntros(opts.userId, opts.confId) : Promise.resolve([]),
    opts.confId ? personPaths(opts.userId, opts.confId) : Promise.resolve([]),
    q<{ id: string; text: string }>(`MATCH (:User {id:$userId})-[:HAS_GOAL]->(g:Goal) RETURN g.id AS id, g.text AS text`, { userId: opts.userId }),
  ]);
  const goalText = new Map(goals.map((g) => [g.id, g.text]));
  const why: Omit<WhyPath, "id">[] = [];
  const mine = met.filter((m) => m.personId === id);
  const first = row.name.split(" ")[0];
  if (mine[0]) {
    const when = mine[0].metAt ? ` in ${MONTH[new Date(mine[0].metAt).getUTCMonth()]}` : "";
    why.push({ text: `You met ${row.name} at ${mine[0].conferenceName}${when}`, nodes: mine[0].nodes, edges: mine[0].edges });
  }
  const w = warm.find((x) => x.personId === id);
  if (w) {
    const nodes = new Map([...w.nodes, ...w.tailNodes].map((n) => [n.id, n]));
    why.push({ text: `${w.viaName.split(" ")[0]}, who you met, was at ${row.name}'s talk; ${first} speaks on ${w.topic}`, nodes: [...nodes.values()], edges: [...w.edges, ...w.tailEdges] });
  }
  const seen = new Set<string>();
  for (const p of paths.filter((x) => x.personId === id && x.via !== "met_before")) {
    const key = `${p.via}:${p.goalId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const goal = goalText.get(p.goalId ?? "") ?? "";
    why.push({
      text: p.via === "speaker"
        ? `${row.name} speaks on ${nameOf(p, "Topic")} ('${nameOf(p, "Session")}'), your goal '${goal}'`
        : `${row.name} works at ${nameOf(p, "Company")}, which offers ${nameOf(p, "Topic")}, your goal '${goal}'`,
      nodes: p.nodes, edges: p.edges,
    });
  }
  detail.why = why.slice(0, 3).map((x, i) => ({ ...x, text: fitWhy(x.text), id: `p${i + 1}` }));
  if (mine.length) detail.metBefore = mine.map((m) => ({ conferenceId: m.prevConferenceId, conferenceName: m.conferenceName, at: m.metAt }));
  return detail;
}

// ---------- search ----------

const MAX_DIST = 0.6;
// Vector search cannot filter by conference. A short neighbor list from other conferences drops this one.
const VECTOR_K = 400;

export async function search(confId: string, text: string): Promise<SearchResponse> {
  const term = text.trim().toLowerCase();
  if (term.length < 2) return { sessions: [], booths: [], people: [] };
  const vec = embedOne(term).catch(() => null);
  const [people, sessions, booths] = await Promise.all([
    q<{ id: string; n: string; c: string }>(
      [
        `MATCH (:Conference {id:$confId})-[:HAS_SESSION]->(:Session)<-[:SPEAKS_AT]-(p:Person)`,
        `MATCH (:Conference {id:$confId})<-[:ATTENDS]-(:User)-[:IS]->(p:Person)`,
        `MATCH (:Conference {id:$confId})-[:HAS_BOOTH]->(:Booth)<-[:HAS_BOOTH]-(:Company)<-[:WORKS_AT]-(p:Person)`,
      ].map((m) => `${m} WITH DISTINCT p, toLower(p.name) AS n, toLower(coalesce(p.company, '')) AS c
         WHERE n STARTS WITH $term OR n CONTAINS (' ' + $term) OR c STARTS WITH $term RETURN p.id AS id, n, c`).join(" UNION "),
      { confId, term },
    ).then((rows) => rows
      .map((r) => ({ id: r.id, rank: r.n.startsWith(term) ? 0 : r.n.includes(` ${term}`) ? 1 : 2, n: r.n }))
      .sort((a, b) => a.rank - b.rank || a.n.localeCompare(b.n))),
    q<{ id: string }>(
      `MATCH (:Conference {id:$confId})-[:HAS_SESSION]->(s:Session) WHERE toLower(s.title) CONTAINS $term RETURN s.id AS id ORDER BY s.start LIMIT 5`,
      { confId, term },
    ),
    q<{ id: string }>(
      `MATCH (:Conference {id:$confId})-[:HAS_BOOTH]->(b:Booth)<-[:HAS_BOOTH]-(co:Company)
       WHERE toLower(co.name) CONTAINS $term OR toLower(b.label) CONTAINS $term RETURN b.id AS id LIMIT 5`,
      { confId, term },
    ),
  ]);
  const v = await vec;
  const [vp, vs, vb] = v
    ? await Promise.all([
        vectorIds(`CALL db.idx.vector.queryNodes('Person', 'embedding', ${VECTOR_K}, vecf32($v)) YIELD node, score
                   MATCH (node)-[:SPEAKS_AT]->(:Session)<-[:HAS_SESSION]-(:Conference {id:$confId}) RETURN DISTINCT node.id AS id, score ORDER BY score`, v, confId),
        vectorIds(`CALL db.idx.vector.queryNodes('Session', 'embedding', ${VECTOR_K}, vecf32($v)) YIELD node, score
                   MATCH (:Conference {id:$confId})-[:HAS_SESSION]->(node) RETURN node.id AS id, score ORDER BY score`, v, confId),
        vectorIds(`CALL db.idx.vector.queryNodes('Company', 'embedding', ${VECTOR_K}, vecf32($v)) YIELD node, score
                   MATCH (:Conference {id:$confId})-[:HAS_BOOTH]->(b:Booth)<-[:HAS_BOOTH]-(node) RETURN b.id AS id, score ORDER BY score`, v, confId),
      ])
    : [[], [], []];
  const merge = (a: string[], b: string[], n: number) => [...new Set([...a, ...b])].slice(0, n);
  const pIds = merge(people.map((r) => r.id), vp, 8), sIds = merge(sessions.map((r) => r.id), vs, 5), bIds = merge(booths.map((r) => r.id), vb, 5);
  const [pRows, sRows, bRows] = await Promise.all([peopleByIds(pIds), sessionsByIds(sIds), boothsByIds(bIds)]);
  const order = <T extends { id: string }>(ids: string[], rows: T[]) => ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is T => !!r);
  return {
    people: order(pIds, pRows).map(toPerson),
    sessions: order(sIds, sRows).map(toSession),
    booths: order(bIds, bRows).map(toBooth),
  };
}

async function vectorIds(cypher: string, v: number[], confId: string): Promise<string[]> {
  const rows = await q<{ id: string; score: number }>(cypher, { v, confId }).catch(() => []);
  return rows.filter((r) => r.score <= MAX_DIST).slice(0, 3).map((r) => r.id);
}
