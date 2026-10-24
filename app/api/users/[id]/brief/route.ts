// GET /api/users/[id]/brief — ?confId=&date=
// STUB: returns mocks until the real handler lands (see GitHub issues).
import * as mocks from "@/mocks";
import { json } from "@/lib/http";
import type { BriefResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return json<BriefResponse>(mocks.brief);
}
