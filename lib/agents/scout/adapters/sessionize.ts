// Sessionize "All" view (GET https://sessionize.com/api/v2/<code>/view/All) → NormalizedConference.
// startsAt/endsAt are venue-local without an offset: the caller passes the venue timezone.
import type { SessionKind } from "@/lib/types";
import { localToIso } from "@/lib/time";
import type { NormPerson, NormSession, NormalizedConference } from "../normalized";

export interface SessionizeAll {
  sessions: {
    id: string; title: string; description?: string | null; startsAt?: string | null; endsAt?: string | null;
    isServiceSession?: boolean; speakers: string[]; categoryItems: number[]; roomId?: number | null; status?: string | null;
  }[];
  speakers: {
    id: string; fullName: string; bio?: string | null; tagLine?: string | null;
    links?: { url: string }[]; questionAnswers?: { questionId: number; answerValue: string | null }[];
  }[];
  questions?: { id: number; question: string }[];
  categories?: { id: number; title: string; items: { id: number; name: string }[] }[];
  rooms?: { id: number; name: string }[];
}

export const sessionizeUrl = (code: string) => `https://sessionize.com/api/v2/${code}/view/All`;

/** Logistics tracks that aren't content. */
const SKIP = /^(breaks?|registration|meals?|lunch|networking)$/i;
/** Format tracks: they set the kind, not a topic. */
const FORMAT: [RegExp, SessionKind][] = [
  [/keynote/i, "keynote"], [/tutorial|workshop|contribfest|lab/i, "workshop"], [/panel/i, "panel"],
  [/lightning|poster|theater|showcase|maintainer|talk|session|track|experiences|co-located|pavilion|opportunit/i, "talk"],
];
const TOPIC_GROUPS = /^(all sessions|track|tracks|topic|topics|subtopic|cncf projects|technology|technologies)$/i;

export function sessionizeToNormalized(opts: {
  data: SessionizeAll;
  conference: NormalizedConference["conference"];
  source: string;
  collectedAt: string;
  timeZone: string;
  idPrefix: string;
}): NormalizedConference {
  const { data } = opts;
  const qid = (re: RegExp) => data.questions?.find((q) => re.test(q.question))?.id;
  const qCompanyOverride = qid(/^company override$/i);
  const qCompany = qid(/^company$/i);
  const qTitle = qid(/title/i);
  const item = new Map<number, { name: string; group: string }>();
  data.categories?.forEach((c) => c.items.forEach((i) => item.set(i.id, { name: i.name.replace(/^[^\p{L}\p{N}]+/u, "").trim(), group: c.title })));
  const room = new Map((data.rooms ?? []).map((r) => [r.id, r.name]));

  const speakers = new Map<string, NormPerson>();
  for (const sp of data.speakers) {
    const answer = (id?: number) => (id ? sp.questionAnswers?.find((a) => a.questionId === id)?.answerValue?.trim() || undefined : undefined);
    const [tagCompany, ...tagTitle] = (sp.tagLine ?? "").split(",").map((x) => x.trim());
    speakers.set(sp.id, {
      name: sp.fullName.trim(),
      company: answer(qCompanyOverride) ?? answer(qCompany) ?? (tagCompany || undefined),
      title: answer(qTitle) ?? (tagTitle.join(", ") || undefined),
      bio: sp.bio ?? undefined,
      links: sp.links?.map((l) => l.url).filter(Boolean),
    });
  }

  const sessions: NormSession[] = [];
  for (const s of data.sessions) {
    if (!s.startsAt || !s.endsAt || s.isServiceSession) continue;
    const cats = s.categoryItems.map((id) => item.get(id)).filter((c): c is { name: string; group: string } => Boolean(c));
    if (cats.some((c) => SKIP.test(c.name))) continue;
    const kind = kindOf(s.title, cats.map((c) => c.name));
    const topics = cats
      .filter((c) => TOPIC_GROUPS.test(c.group) && !FORMAT.some(([re]) => re.test(c.name)))
      .map((c) => c.name);
    sessions.push({
      id: `${opts.idPrefix}-${s.id}`,
      title: s.title.trim(),
      abstract: s.description ?? undefined,
      kind,
      start: localToIso(s.startsAt, opts.timeZone),
      end: localToIso(s.endsAt, opts.timeZone),
      room: s.roomId != null ? room.get(s.roomId) : undefined,
      speakers: s.speakers.map((id) => speakers.get(id)).filter((p): p is NormPerson => Boolean(p)),
      topics: [...new Set(topics)].slice(0, 4),
    });
  }
  return {
    conference: opts.conference,
    provenance: { source: opts.source, collectedAt: opts.collectedAt, via: "sessionize" },
    sessions,
    companies: [],
  };
}

function kindOf(title: string, cats: string[]): SessionKind {
  if (/^keynote|keynote:/i.test(title)) return "keynote";
  if (/\bpanel\b/i.test(title)) return "panel";
  for (const c of cats) for (const [re, k] of FORMAT) if (re.test(c)) return k;
  return "talk";
}
