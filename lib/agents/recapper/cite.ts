// Brief citation parser (pure). The LLM ends every sentence with the path id it came from, like "[p3]".
// Lines that cite nothing, or cite an id not in the given paths, are dropped: no sentence without a real path.
import type { BriefLine, BriefSection } from "@/lib/types";

const CITE = /\s*\[(p\d+)\]/g;

/** One raw sentence → `{text, pathId}` (last valid citation wins), or null if it cites no known path. */
export function parseLine(raw: string, validIds: ReadonlySet<string>): BriefLine | null {
  const ids = [...raw.matchAll(CITE)].map((m) => m[1]);
  if (!ids.length || ids.some((id) => !validIds.has(id))) return null;
  const text = raw.replace(CITE, "").replace(/\s+([.,;:!?])/g, "$1").replace(/\s+/g, " ").trim();
  return text ? { text, pathId: ids[ids.length - 1] } : null;
}

/** Parse every section; drop rejected lines and then empty sections. */
export function parseSections(raw: { title: string; lines: string[] }[], validIds: ReadonlySet<string>): BriefSection[] {
  return raw
    .map((s) => ({ title: s.title.trim(), lines: s.lines.map((l) => parseLine(l, validIds)).filter((l): l is BriefLine => l !== null) }))
    .filter((s) => s.title && s.lines.length);
}
