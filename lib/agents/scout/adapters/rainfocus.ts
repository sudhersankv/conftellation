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
