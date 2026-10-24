// One shape every ingest route (platform adapters, Unlocker+LLM, seed files) converges on.
// upsertConference() turns it into graph writes using the identity rules (spec §5.3).
import type { SessionKind, Via } from "@/lib/types";

export interface NormPerson {
  id?: string; // override; default slug(name)@companySlug
  name: string;
  title?: string;
  company?: string;
  bio?: string;
  links?: string[];
}

export interface NormSession {
  id?: string; // override; default `${confId}-${slug(title)}`
  title: string;
  abstract?: string;
  kind: SessionKind;
  start: string; // ISO with offset
  end: string;
  room?: string;
  url?: string;
  speakers: NormPerson[];
  topics: string[];
}

export interface NormCompany {
  id?: string; // override; default domain(website) or slug(name)
  name: string;
  website?: string;
  description?: string;
  sponsorTier?: string;
  topics: string[];
  booth?: { id?: string; label: string; hall?: string; order?: number };
  people?: NormPerson[]; // booth staff etc. (WORKS_AT only)
  provenance?: { source: string; collectedAt: string; via: Via }; // e.g. enriched from the sponsor's own site
}

export interface NormalizedConference {
  conference: { id: string; name: string; url: string; startDate: string; endDate: string; city?: string; timezone?: string };
  provenance: { source: string; collectedAt: string; via: Via };
  sessions: NormSession[];
  companies: NormCompany[];
  people?: NormPerson[]; // extra people not attached to a session
}

// ---------- identity (spec §5.3) ----------

export function slug(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Company part of a Person id: "Acme Trace" → "acmetrace". */
export function companySlug(name: string): string {
  return slug(name).replace(/-/g, "");
}

export function personId(name: string, company?: string): string {
  const c = company ? companySlug(company) : "";
  return c ? `${slug(name)}@${c}` : slug(name);
}

export function domainOf(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase() || undefined;
  } catch {
    return undefined;
  }
}

export function companyId(name: string, website?: string): string {
  return domainOf(website) ?? slug(name);
}

/** Topic id: lowercase, trimmed, whitespace collapsed, parentheticals dropped. */
export function topicId(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9/+.\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripHtml(s?: string): string | undefined {
  if (!s) return s;
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
