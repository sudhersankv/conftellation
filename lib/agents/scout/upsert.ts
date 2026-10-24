// NormalizedConference → shared conference layer. MERGE on id only; every scraped node gets source/collectedAt/via.
// Topics merge into an existing Topic when embedding similarity ≥ 0.9 (spec §5.3).
import { q } from "@/lib/falkor";
import { embed } from "@/lib/llm";
import {
  companyId, personId, slug, stripHtml, topicId,
  type NormCompany, type NormPerson, type NormalizedConference,
} from "./normalized";

export interface UpsertResult {
  counts: { sessions: number; people: number; companies: number; booths: number };
  ids: { sessions: string[]; people: string[]; companies: string[]; booths: string[]; topics: string[] };
}

const TOPIC_MERGE_SIM = 0.9;
const EMBED_BATCH = 25;

/** Drop undefined/null/"" so `SET n += $p` never erases existing values. */
function props(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)));
}

export async function upsertConference(n: NormalizedConference): Promise<UpsertResult> {
  const confId = n.conference.id;
  const prov = n.provenance;

  // ----- companies (listed = sponsors/exhibitors) -----
  const companyByName = new Map<string, string>();
  const companies = n.companies.map((c) => {
    const id = c.id ?? companyId(c.name, c.website);
    companyByName.set(c.name.toLowerCase(), id);
    return { ...c, id };
  });
  const affiliations = [
    ...n.sessions.flatMap((s) => s.speakers.map((p) => p.company)),
    ...(n.people ?? []).map((p) => p.company),
  ].filter((c): c is string => Boolean(c) && !companyByName.has(c!.toLowerCase()));
  if (affiliations.length) {
    const known = await q<{ n: string; id: string }>(
      `MATCH (co:Company) WHERE toLower(co.name) IN $names RETURN toLower(co.name) AS n, co.id AS id`,
      { names: [...new Set(affiliations.map((a) => a.toLowerCase()))] },
    );
    known.forEach((k) => companyByName.set(k.n, k.id));
  }
  const resolveCompany = (name?: string) => (name ? companyByName.get(name.toLowerCase()) ?? slug(name) : undefined);

  // ----- people (speakers, staff, extras), merged by id -----
  const people = new Map<string, NormPerson & { id: string; companyId?: string; talks: string[] }>();
  const addPerson = (p: NormPerson, talk?: string) => {
    const id = p.id ?? personId(p.name, p.company);
    const prev = people.get(id);
    const merged = { ...prev, ...props(p as never), id, companyId: resolveCompany(p.company), talks: prev?.talks ?? [] } as NormPerson & {
      id: string; companyId?: string; talks: string[];
    };
    if (talk) merged.talks.push(talk);
    people.set(id, merged);
    return id;
  };

  // ----- sessions -----
  const sessions = n.sessions.map((s) => {
    const id = s.id ?? `${confId}-${slug(s.title)}`.slice(0, 120);
    const speakerIds = s.speakers.map((p) => addPerson(p, s.title));
    return { ...s, id, abstract: stripHtml(s.abstract), speakerIds };
  });
  companies.forEach((c) => c.people?.forEach((p) => addPerson({ ...p, company: p.company ?? c.name })));
  n.people?.forEach((p) => addPerson(p));

  // ----- topics: normalize, then merge new ones into near-duplicates -----
  const allTopicNames = new Map<string, string>();
  for (const t of [...sessions.flatMap((s) => s.topics), ...companies.flatMap((c) => c.topics)]) {
    const id = topicId(t);
    if (id && !allTopicNames.has(id)) allTopicNames.set(id, t.trim());
  }
  const topicMap = await resolveTopics(allTopicNames);
  const tids = (names: string[]) => [...new Set(names.map(topicId).filter(Boolean).map((id) => topicMap.get(id) ?? id))];

  // ----- writes -----
  const now = { source: prov.source, collectedAt: prov.collectedAt, via: prov.via };
  await q(`MERGE (c:Conference {id:$id}) SET c += $p`, { id: confId, p: props({ ...n.conference, ...now }) });

  const stubCompanies = [...people.values()]
    .filter((p) => p.companyId && !companies.some((c) => c.id === p.companyId))
    .map((p) => ({ id: p.companyId!, name: p.company! }));
  if (stubCompanies.length) {
    await q(`UNWIND $rows AS r MERGE (co:Company {id:r.id}) ON CREATE SET co.name = r.name, co.source = $src, co.collectedAt = $at, co.via = $via`, {
      rows: dedupe(stubCompanies), src: prov.source, at: prov.collectedAt, via: prov.via,
    });
  }

  await q(
    `MATCH (c:Conference {id:$confId})
     UNWIND $rows AS r
     MERGE (co:Company {id:r.id}) SET co += r.p
     MERGE (co)-[:SPONSORS]->(c)
     FOREACH (tid IN r.topics | MERGE (t:Topic {id:tid}) ON CREATE SET t.name = tid MERGE (co)-[:OFFERS]->(t))`,
    { confId, rows: companies.map((c) => ({ id: c.id, topics: tids(c.topics), p: props(companyProps(c, now)) })) },
  );

  const booths = companies
    .filter((c) => c.booth)
    .map((c) => ({ id: c.booth!.id ?? `${confId}-booth-${slug(c.booth!.label)}-${slug(c.name)}`, companyId: c.id, p: props({ label: c.booth!.label, hall: c.booth!.hall, order: c.booth!.order, conferenceId: confId }) }));
  if (booths.length) {
    await q(
      `MATCH (c:Conference {id:$confId})
       UNWIND $rows AS r
       MATCH (co:Company {id:r.companyId})
       MERGE (b:Booth {id:r.id}) SET b += r.p
       MERGE (co)-[:HAS_BOOTH]->(b)
       MERGE (c)-[:HAS_BOOTH]->(b)`,
      { confId, rows: booths },
    );
  }

  const personRows = [...people.values()].map((p) => ({
    id: p.id, companyId: p.companyId ?? null,
    p: props({ name: p.name, title: p.title, bio: stripHtml(p.bio), links: p.links, company: p.company, ...now }),
  }));
  await q(
    `UNWIND $rows AS r
     MERGE (p:Person {id:r.id}) SET p += r.p
     WITH p, r WHERE r.companyId IS NOT NULL
     MATCH (co:Company {id:r.companyId})
     MERGE (p)-[:WORKS_AT]->(co)`,
    { rows: personRows },
  );

  const sessionRows = sessions.map((s) => ({
    id: s.id, topics: tids(s.topics), speakers: s.speakerIds,
    p: props({ conferenceId: confId, title: s.title, abstract: s.abstract, kind: s.kind, start: s.start, end: s.end, room: s.room, url: s.url, ...now }),
  }));
  for (const rows of chunks(sessionRows, 100)) {
    await q(
      `MATCH (c:Conference {id:$confId})
       UNWIND $rows AS r
       MERGE (s:Session {id:r.id}) SET s += r.p
       MERGE (c)-[:HAS_SESSION]->(s)
       FOREACH (tid IN r.topics | MERGE (t:Topic {id:tid}) ON CREATE SET t.name = tid MERGE (s)-[:ABOUT]->(t))
       FOREACH (pid IN r.speakers | MERGE (p:Person {id:pid}) MERGE (p)-[:SPEAKS_AT]->(s))`,
      { confId, rows },
    );
  }

  // ----- embeddings -----
  await writeEmbeddings("Session", sessions.map((s) => ({ id: s.id, text: `${s.title}. Topics: ${s.topics.join(", ")}. ${s.abstract?.slice(0, 1500) ?? ""}` })));
  await writeEmbeddings("Person", [...people.values()].map((p) => ({
    id: p.id, text: `${p.name}${p.title ? `, ${p.title}` : ""}${p.company ? ` at ${p.company}` : ""}. ${p.talks.join(". ")}. ${stripHtml(p.bio)?.slice(0, 800) ?? ""}`,
  })));
  await writeEmbeddings("Company", companies.map((c) => ({ id: c.id, text: `${c.name}. ${c.description ?? ""} Topics: ${c.topics.join(", ")}` })));

  return {
    counts: { sessions: sessions.length, people: people.size, companies: companies.length, booths: booths.length },
    ids: { sessions: sessions.map((s) => s.id), people: [...people.keys()], companies: companies.map((c) => c.id), booths: booths.map((b) => b.id), topics: [...new Set([...topicMap.values()])] },
  };
}

function companyProps(c: NormCompany & { id: string }, now: Record<string, string>) {
  return { name: c.name, website: c.website, description: stripHtml(c.description), sponsorTier: c.sponsorTier, ...now };
}

/** Map normalized topic id → canonical topic id (existing exact, existing near-duplicate, or itself, created). */
export async function resolveTopics(names: Map<string, string>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (names.size === 0) return out;
  const ids = [...names.keys()];
  const existing = new Set((await q<{ id: string }>(`MATCH (t:Topic) WHERE t.id IN $ids AND t.embedding IS NOT NULL RETURN t.id AS id`, { ids })).map((r) => r.id));
  ids.filter((id) => existing.has(id)).forEach((id) => out.set(id, id));
  const fresh = ids.filter((id) => !existing.has(id));
  if (fresh.length === 0) return out;
  const vecs = await embed(fresh);
  const created: { id: string; name: string; v: number[] }[] = [];
  for (let i = 0; i < fresh.length; i++) {
    const near = await q<{ id: string; score: number }>(
      `CALL db.idx.vector.queryNodes('Topic','embedding',1,vecf32($v)) YIELD node, score RETURN node.id AS id, score`,
      { v: vecs[i] },
    ).catch(() => []);
    const hit = near[0];
    if (hit && 1 - hit.score >= TOPIC_MERGE_SIM && hit.id !== fresh[i]) out.set(fresh[i], hit.id);
    else {
      out.set(fresh[i], fresh[i]);
      created.push({ id: fresh[i], name: names.get(fresh[i]) ?? fresh[i], v: vecs[i] });
    }
  }
  for (const rows of chunks(created, EMBED_BATCH)) {
    await q(`UNWIND $rows AS r MERGE (t:Topic {id:r.id}) SET t.name = r.name, t.embedding = vecf32(r.v)`, { rows });
  }
  return out;
}

export async function writeEmbeddings(label: "Session" | "Person" | "Company" | "Topic" | "Goal" | "Problem", items: { id: string; text: string }[]) {
  for (const batch of chunks(items, EMBED_BATCH)) {
    const vecs = await embed(batch.map((b) => b.text));
    await q(`UNWIND $rows AS r MATCH (n:${label} {id:r.id}) SET n.embedding = vecf32(r.v)`, {
      rows: batch.map((b, i) => ({ id: b.id, v: vecs[i] })),
    });
  }
}

function chunks<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

function dedupe<T extends { id: string }>(xs: T[]): T[] {
  return [...new Map(xs.map((x) => [x.id, x])).values()];
}
