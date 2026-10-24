// POST /api/users/[id]/moments — multipart: kind, text?, file?, targetId?, personId?, newPerson?
// STUB: returns mocks until the real handler lands (see GitHub issues).
import * as mocks from "@/mocks";
import { json } from "@/lib/http";
import type { CreateMomentResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST() {
  return json<CreateMomentResponse>(mocks.createMoment);
}
