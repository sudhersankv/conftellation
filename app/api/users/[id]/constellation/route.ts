// GET /api/users/[id]/constellation — ?confId= (all conferences if omitted)
// STUB: returns mocks until the real handler lands (see GitHub issues).
import * as mocks from "@/mocks";
import { json } from "@/lib/http";
import type { ConstellationResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return json<ConstellationResponse>(mocks.constellation);
}
