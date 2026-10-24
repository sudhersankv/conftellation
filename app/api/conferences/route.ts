// POST /api/conferences — Scout ingest: POST {url}. Already-imported URL → {cached:true} without refetching.
import * as mocks from "@/mocks";
import { error, handle, json, useMocks } from "@/lib/http";
import { BadInput, importConference } from "@/lib/agents/scout";
import type { AddConferenceRequest, AddConferenceResponse, ConferencesResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET /api/conferences?userId= — catalogue of imported conferences. STUB until the catalogue query lands: returns the mock.
export async function GET() {
  return json<ConferencesResponse>(mocks.conferences);
}

export const POST = handle(async (req: Request) => {
  if (useMocks()) return json<AddConferenceResponse>(mocks.addConference);
  const body = (await req.json().catch(() => null)) as Partial<AddConferenceRequest> | null;
  if (!body || typeof body.url !== "string" || !body.url.trim()) return error("body must be {url}", 400);
  try {
    const r = await importConference(body.url);
    console.log(`[scout] ${body.url} → ${r.response.conference.id} cached=${r.response.cached} path=${r.path ?? "-"} ${r.ms}ms bd=${r.brightDataRequests}` +
      (r.enrich ? ` enriched=${r.enrich.enriched} failed=${r.enrich.failed.length} skipped=${r.enrich.skipped.length}` : ""));
    return json<AddConferenceResponse>(r.response);
  } catch (e) {
    if (e instanceof BadInput) return error(e.message, 422);
    throw e;
  }
});
