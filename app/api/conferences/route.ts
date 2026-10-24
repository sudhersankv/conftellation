// /api/conferences
//   GET ?userId=&now=  catalogue of imported conferences with counts, attendees, and past/live/upcoming status (?now= or DEMO_NOW or today).
//   POST {url} | {name}  Scout ingest. A name is resolved to its schedule page via search first. Already-imported URL → {cached:true}.
import * as mocks from "@/mocks";
import { error, handle, json, useMocks } from "@/lib/http";
import { BadInput, importConference } from "@/lib/agents/scout";
import { NotFound, findScheduleUrl } from "@/lib/agents/scout/find";
import { conferenceCatalogue, conferenceStatus } from "@/lib/queries/conferences";
import type { AddConferenceRequestV2, AddConferenceResponse, ConferenceSummary, ConferencesResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const GET = handle(async (req: Request) => {
  if (useMocks()) return json<ConferencesResponse>(mocks.conferences);
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId")?.trim() || undefined;
  const rawNow = url.searchParams.get("now") ?? process.env.DEMO_NOW ?? undefined;
  const now = rawNow ? new Date(rawNow) : new Date();
  if (Number.isNaN(now.getTime())) return error("now must be an ISO date", 400);
  const rows = await conferenceCatalogue(userId);
  const all: ConferenceSummary[] = rows.map((r) => ({ ...r, status: conferenceStatus(r.conference, now) }));
  // Live conferences lead the upcoming list; upcoming by start date ascending, past most recent first.
  const upcoming = all
    .filter((c) => c.status !== "past")
    .sort((a, b) => Number(b.status === "live") - Number(a.status === "live") || cmp(a.conference.startDate, b.conference.startDate) || a.conference.name.localeCompare(b.conference.name));
  const past = all
    .filter((c) => c.status === "past")
    .sort((a, b) => cmp(b.conference.startDate, a.conference.startDate) || a.conference.name.localeCompare(b.conference.name));
  return json<ConferencesResponse>({ upcoming, past });
});

const cmp = (a?: string, b?: string) => ((a ?? "") < (b ?? "") ? -1 : (a ?? "") > (b ?? "") ? 1 : 0);

export const POST = handle(async (req: Request) => {
  if (useMocks()) return json<AddConferenceResponse>(mocks.addConference);
  const body = (await req.json().catch(() => null)) as AddConferenceRequestV2 | null;
  const rawUrl = typeof body?.url === "string" ? body.url.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!rawUrl && !name) return error("body must be {url} or {name}", 400);
  if (!rawUrl && name.length < 3) return error("name is too short to search for", 422);
  let target = rawUrl;
  try {
    if (!target) target = (await findScheduleUrl(name)).url;
    const r = await importConference(target);
    console.log(`[scout] ${name ? `"${name}" → ` : ""}${target} → ${r.response.conference.id} cached=${r.response.cached} path=${r.path ?? "-"} ${r.ms}ms bd=${r.brightDataRequests}` +
      (r.enrich ? ` enriched=${r.enrich.enriched} failed=${r.enrich.failed.length} skipped=${r.enrich.skipped.length}` : ""));
    return json<AddConferenceResponse>(r.response);
  } catch (e) {
    if (e instanceof NotFound) return error(e.message, 422);
    if (e instanceof BadInput) return error(rawUrl ? e.message : `found ${target} for "${name}" but ${e.message}; paste the schedule URL instead`, 422);
    throw e;
  }
});
