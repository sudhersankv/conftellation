// POST /api/users/[id]/steer — Body: SteerRequest
// STUB: returns mocks until the real handler lands (see GitHub issues).
import * as mocks from "@/mocks";
import { json } from "@/lib/http";
import type { SteerResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST() {
  return json<SteerResponse>(mocks.steer);
}
