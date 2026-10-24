// GET /api/people/[id] — person card: ?confId=&userId=. Unknown person → 404.
import * as mocks from "@/mocks";
import { error, handle, json, useMocks } from "@/lib/http";
import { personDetail } from "@/lib/agents/people";
import type { PersonDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request, { params }: { params: { id: string } }) => {
  const id = decodeURIComponent(params.id);
  if (useMocks()) {
    const p = mocks.people[id];
    return p ? json<PersonDetail>(p) : error("person not found", 404);
  }
  const url = new URL(req.url);
  const detail = await personDetail(id, { confId: url.searchParams.get("confId") ?? undefined, userId: url.searchParams.get("userId") ?? undefined });
  return detail ? json<PersonDetail>(detail) : error("person not found", 404);
});
