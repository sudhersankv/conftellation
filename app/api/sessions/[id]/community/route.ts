// GET /api/sessions/[id]/community — Session community layer
// STUB: returns mocks until the real handler lands (see GitHub issues).
import * as mocks from "@/mocks";
import { json } from "@/lib/http";
import type { CommunityResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return json<CommunityResponse>(mocks.community);
}
