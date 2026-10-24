// GET /api/users/[id]/intros — ?confId=
// STUB: returns mocks until the real handler lands (see GitHub issues).
import * as mocks from "@/mocks";
import { json } from "@/lib/http";
import type { IntrosResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return json<IntrosResponse>(mocks.intros);
}
