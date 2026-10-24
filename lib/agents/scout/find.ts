// "Paste a name, not a URL": conference name → its public schedule page, via Bright Data SERP (cached, counts against the request cap).
// The pick is rule-based (known schedule platforms first, then the event's own schedule/agenda/program page); no LLM guesses a URL.
import { serp, type SerpResult } from "@/lib/brightdata";
import { publicUrlProblem } from "@/lib/publicUrl";

/** Hosts that publish the schedule itself (Scout has an adapter or a reliable generic read for each). */
const PLATFORM: RegExp[] = [
  /^sessionize\.com$/,
  /\.sched\.com$/,
  /^events\.linuxfoundation\.org$/,
  /^reg\.[a-z0-9.-]+$/, // RainFocus registration/catalog hosts (reg.githubuniverse.com, ...)
  /(^|\.)rainfocus\.com$/,
  /(^|\.)pretalx\.(com|org)$/,
  /^pretalx\./,
];

/** Search/aggregator/social hosts: never "the event's own domain". */
const AGGREGATOR = /(^|\.)(google\.[a-z.]+|wikipedia\.org|linkedin\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|youtube\.com|reddit\.com|medium\.com|github\.com|eventbrite\.[a-z.]+|meetup\.com|10times\.com|allevents\.in|conferenceindex\.org|lu\.ma|luma\.com|dev\.events|confs\.tech|news\.ycombinator\.com|substack\.com)$/;
const SCHEDULE_PATH = /(schedule|agenda|program|sessions)/i;

function parsed(link: string): URL | undefined {
  try {
    const u = new URL(link);
    return /^https?:$/.test(u.protocol) && !publicUrlProblem(u.toString()) ? u : undefined;
  } catch {
    return undefined;
  }
}

/** The best schedule URL among search results, or undefined. Platforms win; then the first own-domain schedule/agenda/program page. */
export function pickScheduleUrl(results: SerpResult[]): string | undefined {
  const urls = results.map((r) => parsed(r.link)).filter((u): u is URL => Boolean(u));
  // A platform's bare home page lists every event, so it needs a path (a sched.com subdomain is already one event).
  const platform = urls.find((u) => {
    const host = u.hostname.toLowerCase();
    return PLATFORM.some((re) => re.test(host)) && (u.pathname.length > 1 || /\.sched\.com$/.test(host));
  });
  if (platform) return platform.toString();
  const own = urls.find((u) => !AGGREGATOR.test(u.hostname.toLowerCase()) && SCHEDULE_PATH.test(u.pathname));
  return own?.toString();
}

export class NotFound extends Error {}

/** `"<name> schedule"`, then `"<name> agenda sessions"` only when the first search had nothing plausible. */
export async function findScheduleUrl(name: string): Promise<{ url: string; query: string }> {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 120);
  let failure: string | undefined;
  for (const query of [`${clean} schedule`, `${clean} agenda sessions`]) {
    let results: SerpResult[];
    try {
      results = (await serp(query)).data;
    } catch (e) {
      failure = e instanceof Error ? e.message : String(e);
      continue;
    }
    const url = pickScheduleUrl(results);
    if (url) return { url, query };
  }
  throw new NotFound(failure
    ? `search is unavailable right now (${failure.slice(0, 120)}); paste the conference's schedule or agenda URL instead`
    : `couldn't find a public schedule page for "${clean}"; paste the conference's schedule or agenda URL instead`);
}
