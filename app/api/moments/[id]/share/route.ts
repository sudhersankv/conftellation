// POST /api/moments/[id]/share — Body: {to: userIds[] | "network"}
// STUB: returns mocks until the real handler lands (see GitHub issues).
import * as mocks from "@/mocks";
import { json } from "@/lib/http";
import type { Moment } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST() {
  return json<Moment>(mocks.createMoment.moment);
}
