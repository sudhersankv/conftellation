// Conference layer reads for Scout: lookup by URL, counts, detail.
import { q } from "@/lib/falkor";
import type { Company, Conference, Via } from "@/lib/types";
import { boothsByIds, sessionsByIds, type BoothRow, type SessionRow } from "./plan";

const CONF_FIELDS = `c.id AS id, c.name AS name, c.url AS url, c.startDate AS startDate, c.endDate AS endDate, c.city AS city,
  c.timezone AS timezone, c.source AS source, c.collectedAt AS collectedAt, c.via AS via`;

type ConfRow = { [K in keyof Conference]-?: Conference[K] | null };

export function toConference(r: ConfRow): Conference {
  const out = Object.fromEntries(Object.entries(r).filter(([, v]) => v != null)) as unknown as Conference;
  return out;
}

export async function conferenceByUrl(urls: string[]): Promise<Conference | null> {
  const [r] = await q<ConfRow>(`MATCH (c:Conference) WHERE c.url IN $urls OR c.source IN $urls RETURN ${CONF_FIELDS} LIMIT 1`, { urls });
  return r ? toConference(r) : null;
}

export async function conferenceById(id: string): Promise<Conference | null> {
  const [r] = await q<ConfRow>(`MATCH (c:Conference {id:$id}) RETURN ${CONF_FIELDS}`, { id });
  return r ? toConference(r) : null;
}

export async function conferenceCounts(id: string) {
  const [r] = await q<{ sessions: number; people: number; companies: number; booths: number }>(
    `MATCH (c:Conference {id:$id})
     OPTIONAL MATCH (c)-[:HAS_SESSION]->(s:Session)
     WITH c, count(s) AS sessions
     OPTIONAL MATCH (c)-[:HAS_SESSION]->(:Session)<-[:SPEAKS_AT]-(p:Person)
     WITH c, sessions, count(DISTINCT p) AS people
     OPTIONAL MATCH (co:Company)-[:SPONSORS]->(c)
     WITH c, sessions, people, count(co) AS companies
     OPTIONAL MATCH (c)-[:HAS_BOOTH]->(b:Booth)
     RETURN sessions, people, companies, count(b) AS booths`,
    { id },
  );
  return r ?? { sessions: 0, people: 0, companies: 0, booths: 0 };
}

export async function conferenceSessions(id: string): Promise<SessionRow[]> {
  const ids = await q<{ id: string }>(`MATCH (:Conference {id:$id})-[:HAS_SESSION]->(s:Session) RETURN s.id AS id`, { id });
  const rows = await sessionsByIds(ids.map((r) => r.id));
  return rows.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.title.localeCompare(b.title)));
}

export async function conferenceBooths(id: string): Promise<BoothRow[]> {
  const ids = await q<{ id: string }>(`MATCH (:Conference {id:$id})-[:HAS_BOOTH]->(b:Booth) RETURN b.id AS id`, { id });
  const rows = await boothsByIds(ids.map((r) => r.id));
  return rows.sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || a.label.localeCompare(b.label));
}

const TIER = ["diamond", "platinum", "gold", "silver", "bronze", "start-up", "startup", "end user"];

export async function conferenceSponsors(id: string): Promise<Company[]> {
  const rows = await q<{ id: string; name: string; description: string | null; website: string | null; sponsorTier: string | null; topics: string[]; source: string | null; collectedAt: string | null; via: string | null }>(
    `MATCH (co:Company)-[:SPONSORS]->(:Conference {id:$id})
     OPTIONAL MATCH (co)-[:OFFERS]->(t:Topic)
     RETURN co.id AS id, co.name AS name, co.description AS description, co.website AS website, co.sponsorTier AS sponsorTier,
            collect(t.id) AS topics, co.source AS source, co.collectedAt AS collectedAt, co.via AS via`,
    { id },
  );
  const rank = (t: string | null) => {
    const i = TIER.indexOf((t ?? "").toLowerCase());
    return i < 0 ? TIER.length : i;
  };
  return rows
    .sort((a, b) => rank(a.sponsorTier) - rank(b.sponsorTier) || Number(Boolean(b.description)) - Number(Boolean(a.description)) || a.name.localeCompare(b.name))
    .map((r) => ({
      id: r.id, name: r.name, description: r.description ?? undefined, website: r.website ?? undefined, sponsorTier: r.sponsorTier ?? undefined,
      topics: r.topics, source: r.source ?? undefined, collectedAt: r.collectedAt ?? undefined, via: (r.via ?? undefined) as Via | undefined,
    }));
}

/** Topic ids at the conference, most sessions first. */
export async function conferenceTopics(id: string): Promise<string[]> {
  const rows = await q<{ id: string; n: number }>(
    `MATCH (:Conference {id:$id})-[:HAS_SESSION]->(s:Session)-[:ABOUT]->(t:Topic)
     WITH t, count(s) AS n
     RETURN t.id AS id, n ORDER BY n DESC, id`,
    { id },
  );
  return rows.map((r) => r.id);
}
