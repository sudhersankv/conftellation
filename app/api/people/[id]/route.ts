// GET /api/people/[id] — person card: ?confId=&userId=
// STUB: returns mocks until the real handler lands (see GitHub issues).
import * as mocks from "@/mocks";
import { error, json } from "@/lib/http";
import type { PersonDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const p = mocks.people[decodeURIComponent(params.id)];
  return p ? json<PersonDetail>(p) : error("person not found", 404);
}
