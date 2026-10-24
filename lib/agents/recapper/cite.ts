// Brief citation parser (pure). The LLM ends every sentence with the path id it came from, like "[p3]".
// Lines that cite nothing, cite an unknown id, or carry a second sentence after a citation are dropped.
import type { BriefLine, BriefSection } from "@/lib/types";

const CITE = /\s*\[(p\d+)\]/g;

/** One raw sentence → `{text, pathId}` (last valid citation wins), or null if it cites no known path. */
export function parseLine(raw: string, validIds: ReadonlySet<string>): BriefLine | null {
  const matches = [...raw.matchAll(CITE)];
  const ids = matches.map((m) => m[1]);
  if (!ids.length || ids.some((id) => !validIds.has(id))) return null;
  const last = matches[matches.length - 1];
  const after = raw.slice((last.index ?? 0) + last[0].length);
  // A citation in the middle must not let more words through ("Fact [p1]. Invented sentence.").
  if (/[A-Za-z0-9]/.test(after)) return null;
  const stripped = raw.replace(CITE, " ");
  const sentences = stripped.split(/[.!?]+/).map((s) => s.replace(/[^A-Za-z0-9]+/g, "")).filter(Boolean);
  if (sentences.length !== 1) return null;
  const text = raw.replace(CITE, "").replace(/\s+([.,;:!?])/g, "$1").replace(/\s+/g, " ").trim();
  return text ? { text, pathId: ids[ids.length - 1] } : null;
}

/**
 * Parse every section. Drop rejected lines, empty sections, and (when `allowedTitles` is set)
 * unknown or duplicate titles. Known sections come back in that order.
 */
export function parseSections(
  raw: { title: string; lines: string[] }[],
  validIds: ReadonlySet<string>,
  allowedTitles?: readonly string[],
): BriefSection[] {
  const parsed = raw
    .map((s) => ({ title: s.title.trim(), lines: s.lines.map((l) => parseLine(l, validIds)).filter((l): l is BriefLine => l !== null) }))
    .filter((s) => s.title && s.lines.length);
  if (!allowedTitles) return parsed;
  const allowed = new Set(allowedTitles);
  const byTitle = new Map<string, BriefSection>();
  for (const s of parsed) {
    if (!allowed.has(s.title) || byTitle.has(s.title)) continue;
    byTitle.set(s.title, s);
  }
  return allowedTitles.flatMap((title) => {
    const s = byTitle.get(title);
    return s ? [s] : [];
  });
}
