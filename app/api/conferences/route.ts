// POST /api/conferences — Scout ingest: POST {url}
// STUB: returns mocks until the real handler lands (see GitHub issues).
import * as mocks from "@/mocks";
import { json } from "@/lib/http";
import type { AddConferenceResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST() {
  return json<AddConferenceResponse>(mocks.addConference);
}
