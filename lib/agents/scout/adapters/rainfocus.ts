// RainFocus session catalog (e.g. GitHub Universe) → NormalizedConference.
// Input: session items in the "slim" shape (see seed/raw/github-universe-2026-sessions.slim.json).
import type { SessionKind, Via } from "@/lib/types";
import { isoInZone } from "@/lib/time";
import type { NormCompany, NormSession, NormalizedConference } from "../normalized";

export interface RainFocusSlimSession {
  sessionID: string;
  code?: string;
  title: string;
  type?: string;
  abstract?: string;
  times?: { utcStartTime: string; utcEndTime: string; room?: string }[];
  speakers?: { fullName: string; jobTitle?: string; companyName?: string }[];
  attributes?: Record<string, string | string[] | undefined>;
}

export interface RainFocusExhibitor { name: string; description?: string; externalLink?: string; code?: string }

const KIND: Record<string, SessionKind> = {
  keynote: "keynote", "main stage": "keynote", workshop: "workshop", "panel discussion": "panel",
  "breakout session": "talk", "product demo": "talk", "ship & tell": "talk", "sandbox session": "talk",
};

const TOPIC_ALIAS: Record<string, string> = {
  "AI: Agents": "agents",
  "AI: Models": "ai models",
  "AI: MCP and other integrations": "mcp",
  "Developer experience (DX)": "developer experience",
  "Security (RASP, supply chain, threat modeling, vulnerability detection)": "security",
  "Continuous Integration + Continuous Deployment (CI/CD)": "ci/cd",
  "Code quality, review, and completion": "code review",
};

const utc = (s: string) => new Date(`${s.replace(/\//g, "-").replace(" ", "T")}Z`);
const list = (v: string | string[] | undefined) => (v == null ? [] : Array.isArray(v) ? v : [v]);

export function rainfocusToNormalized(opts: {
  conference: NormalizedConference["conference"];
  sessions: RainFocusSlimSession[];
  exhibitors?: RainFocusExhibitor[];
  source: string;
  collectedAt: string;
  via?: Via;
  timeZone: string;
  idPrefix: string; // e.g. "ghu26"
}): NormalizedConference {
  const sessions: NormSession[] = opts.sessions
    .filter((s) => s.times?.length)
    .map((s) => {
      const t = s.times![0];
      const topics = [
        ...list(s.attributes?.Topic).map((x) => TOPIC_ALIAS[x.trim()] ?? x.trim()),
        ...list(s.attributes?.GitHubproduct).filter((x) => x && x !== "Not applicable"),
      ].filter(Boolean);
      return {
        id: `${opts.idPrefix}-${(s.code ?? s.sessionID).toLowerCase()}`,
        title: s.title.trim(),
        abstract: s.abstract,
        kind: KIND[(s.type ?? "").toLowerCase()] ?? "other",
        start: isoInZone(utc(t.utcStartTime), opts.timeZone),
        end: isoInZone(utc(t.utcEndTime), opts.timeZone),
        room: t.room,
        speakers: (s.speakers ?? []).map((p) => ({ name: p.fullName.trim(), title: p.jobTitle, company: p.companyName })),
        topics: [...new Set(topics)].slice(0, 4),
      };
    });
  const companies: NormCompany[] = (opts.exhibitors ?? []).map((e) => ({
    name: e.name.trim(),
    website: e.externalLink || undefined,
    description: e.description,
    topics: [],
  }));
  return {
    conference: opts.conference,
    provenance: { source: opts.source, collectedAt: opts.collectedAt, via: opts.via ?? "rainfocus" },
    sessions,
    companies,
  };
}

// ---------- live catalog (public widget API) ----------

export interface RainFocusSite {
  hosts: string[];
  conference: NormalizedConference["conference"];
  origin: string; // Origin/Referer the widget expects
  profileId: string;
  sessionWidget: string;
  exhibitorWidget?: string;
  timeZone: string;
  idPrefix: string;
  source: string;
}

/** Catalog ids are discovered per site (issue #3 probe); unknown RainFocus sites fall through to the generic path. */
export const RAINFOCUS_SITES: RainFocusSite[] = [
  {
    hosts: ["githubuniverse.com", "www.githubuniverse.com", "reg.githubuniverse.com"],
    conference: { id: "github-universe-2026", name: "GitHub Universe 2026", url: "https://githubuniverse.com", startDate: "2026-10-28", endDate: "2026-10-29", city: "San Francisco", timezone: "America/Los_Angeles" },
    origin: "https://reg.githubuniverse.com",
    profileId: "TJRfOIsFkCN8hnKQS3oqHpRTCt7LQMuV",
    sessionWidget: "1778595031036001ei5o",
    exhibitorWidget: "1775680413768003YDHF",
    timeZone: "America/Los_Angeles",
    idPrefix: "ghu26",
    source: "https://reg.githubuniverse.com/flow/github/universe26/attendee-portal/page/sessioncatalog",
  },
];

interface RawSession {
  sessionID: string; code?: string; title: string; type?: string; abstract?: string; published?: boolean | string;
  times?: { utcStartTime: string; utcEndTime: string; room?: string }[];
  participants?: { fullName?: string; firstName?: string; lastName?: string; jobTitle?: string; companyName?: string; session?: { sessionID: string; published?: string }[] }[];
  attributevalues?: { attribute_id: string; value: string }[];
}

type Post = (url: string, init: RequestInit) => Promise<{ data: unknown; collectedAt: string }>;

async function search<T>(post: Post, site: RainFocusSite, type: string, widget: string, max = 600): Promise<{ items: T[]; collectedAt: string }> {
  const items: T[] = [];
  let collectedAt = new Date().toISOString();
  for (let from = 0; from < max; from += 50) {
    const r = await post("https://events.rainfocus.com/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", rfApiProfileId: site.profileId, rfWidgetId: widget, Origin: site.origin, Referer: `${site.origin}/` },
      body: `type=${type}&size=50&from=${from}`,
    });
    collectedAt = r.collectedAt;
    const d = r.data as { items?: T[]; sectionList?: { items?: T[] }[] };
    const page = d.sectionList?.[0]?.items ?? d.items ?? [];
    items.push(...page);
    if (page.length < 50) break;
  }
  return { items, collectedAt };
}

export async function fetchRainFocus(site: RainFocusSite, post: Post): Promise<NormalizedConference> {
  const { items, collectedAt } = await search<RawSession>(post, site, "session", site.sessionWidget);
  const sessions: RainFocusSlimSession[] = items
    .filter((s) => s.published !== false && s.published !== "false")
    .map((s) => ({
      sessionID: s.sessionID, code: s.code, title: s.title, type: s.type, abstract: s.abstract, times: s.times,
      speakers: (s.participants ?? [])
        .filter((p) => !p.session || p.session.some((x) => x.sessionID === s.sessionID && x.published !== "false"))
        .map((p) => ({ fullName: p.fullName ?? `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim(), jobTitle: p.jobTitle, companyName: p.companyName })),
      attributes: (s.attributevalues ?? []).reduce<Record<string, string[]>>((a, v) => ((a[v.attribute_id] ??= []).push(v.value), a), {}),
    }));
  const exhibitors = site.exhibitorWidget ? (await search<RainFocusExhibitor>(post, site, "exhibitor", site.exhibitorWidget)).items : [];
  return rainfocusToNormalized({ conference: site.conference, sessions, exhibitors, source: site.source, collectedAt, timeZone: site.timeZone, idPrefix: site.idPrefix });
}
