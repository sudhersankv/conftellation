// GET /api/conferences/[id] — Conference + sessions + booths
// STUB: returns mocks until the real handler lands (see GitHub issues).
import * as mocks from "@/mocks";
import { json } from "@/lib/http";
import type { ConferenceDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return json<ConferenceDetail>(mocks.conferenceDetail);
}
