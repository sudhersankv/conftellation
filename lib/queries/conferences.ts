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

export interface CatalogueRow {
  conference: Conference;
  counts: { sessions: number; people: number; companies: number; booths: number };
  attendees: number;
  attending: boolean;
}

/**
 * Every Conference with its counts. people = speakers at its sessions ∪ people who work at its sponsors/exhibitors;
 * companies = SPONSORS ∪ companies with a booth there; attendees = users with ATTENDS; attending = `userId` ATTENDS.
 */
export async function conferenceCatalogue(userId?: string): Promise<CatalogueRow[]> {
  type Row = ConfRow & { sessions: number; people: number; companies: number; booths: number; attendees: number; attending: boolean };
  const rows = await q<Row>(
    `MATCH (c:Conference)
     OPTIONAL MATCH (c)-[:HAS_SESSION]->(s:Session)
     WITH c, count(DISTINCT s) AS sessions
     OPTIONAL MATCH (c)-[:HAS_SESSION]->(:Session)<-[:SPEAKS_AT]-(sp:Person)
     WITH c, sessions, collect(DISTINCT sp.id) AS speakers
     OPTIONAL MATCH (sc:Company)-[:SPONSORS]->(c)
     WITH c, sessions, speakers, collect(DISTINCT sc.id) AS sponsors
     OPTIONAL MATCH (c)-[:HAS_BOOTH]->(b:Booth)
     OPTIONAL MATCH (bc:Company)-[:HAS_BOOTH]->(b)
     WITH c, sessions, speakers, sponsors, count(DISTINCT b) AS booths, collect(DISTINCT bc.id) AS exhibitors
     WITH c, sessions, speakers, booths, sponsors + [x IN exhibitors WHERE NOT x IN sponsors] AS cos
     OPTIONAL MATCH (w:Person)-[:WORKS_AT]->(wc:Company) WHERE wc.id IN cos
     WITH c, sessions, speakers, booths, cos, collect(DISTINCT w.id) AS staff
     OPTIONAL MATCH (u:User)-[:ATTENDS]->(c)
     WITH c, sessions, booths, size(cos) AS companies, size(speakers) + size([x IN staff WHERE NOT x IN speakers]) AS people,
          count(DISTINCT u) AS attendees, sum(CASE WHEN u.id = $userId THEN 1 ELSE 0 END) AS mine
     RETURN ${CONF_FIELDS}, sessions, people, companies, booths, attendees, mine > 0 AS attending`,
    { userId: userId ?? "" },
  );
  return rows.map(({ sessions, people, companies, booths, attendees, attending, ...conf }) => ({
    conference: toConference(conf as ConfRow),
    counts: { sessions, people, companies, booths },
    attendees,
    attending: Boolean(userId) && Boolean(attending),
  }));
}

/** "YYYY-MM-DD" of `now` in the conference's timezone (PT when it has none). */
export function localDay(now: Date, timeZone = "America/Los_Angeles"): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  }
}

/** past / live / upcoming by the conference's own calendar days. */
export function conferenceStatus(c: Pick<Conference, "startDate" | "endDate" | "timezone">, now: Date): "past" | "live" | "upcoming" {
  const today = localDay(now, c.timezone);
  const start = (c.startDate ?? "").slice(0, 10);
  const end = (c.endDate || c.startDate || "").slice(0, 10);
  if (end && end < today) return "past";
  if (start && start <= today) return "live";
  return "upcoming";
}

// "Paste a name": a conference already in the catalogue should win over a web search.
const NAME_STOP = new Set(["conference", "conf", "the", "and", "of", "summit", "con", "event", "events", "schedule", "agenda"]);
const NAME_ALIAS: Record<string, string[]> = { na: ["north", "america"], eu: ["europe"], us: ["united", "states"], uk: ["united", "kingdom"] };
function nameTokens(s: string): string[] {
  return s.toLowerCase().replace(/[+&]/g, " ").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean)
    .flatMap((t) => NAME_ALIAS[t] ?? [t]).filter((t) => !NAME_STOP.has(t));
}
/** The catalogue conference whose name contains every significant token of `name` (year must match if given), else null. */
export async function conferenceByName(name: string): Promise<Conference | null> {
  const want = nameTokens(name);
  if (want.length === 0) return null;
  const rows = await q<ConfRow>(`MATCH (c:Conference) RETURN ${CONF_FIELDS}`);
  const hits = rows.filter((r) => { const have = new Set(nameTokens(r.name ?? "")); return want.every((t) => have.has(t)); });
  if (hits.length === 0) return null;
  // Prefer the closest name (fewest extra tokens), then the latest start date.
  hits.sort((a, b) => nameTokens(a.name ?? "").length - nameTokens(b.name ?? "").length || String(b.startDate ?? "").localeCompare(String(a.startDate ?? "")));
  return toConference(hits[0]);
}
