// GET /api/users/[id]/record — Personal record
// STUB: returns mocks until the real handler lands (see GitHub issues).
import * as mocks from "@/mocks";
import { json } from "@/lib/http";
import type { RecordResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return json<RecordResponse>(mocks.record);
}
