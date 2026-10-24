// POST /api/meets/[id]/respond — Body: MeetRespondBody
// STUB: returns mocks until the real handler lands (see GitHub issues).
import * as mocks from "@/mocks";
import { json } from "@/lib/http";
import type { MeetRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST() {
  return json<MeetRequest>(mocks.meetRequest);
}
