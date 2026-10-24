// POST /api/users/[id]/meet — Body: MeetRequestBody & { confId } → pending MeetRequest (a repeat to the same user updates the open one).
// The sender is the URL id. When an acting user is also given (body `userId`, `x-user-id`, or the `ptc_user` cookie) it must match → else 403.
import * as mocks from "@/mocks";
import { callerId, error, handle, json, useMocks } from "@/lib/http";
import { MeetError, requestMeet } from "@/lib/agents/network";
import type { MeetRequest, MeetRequestBody } from "@/lib/types";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => {
  if (useMocks()) return json<MeetRequest>(mocks.meetRequest);
  const body = (await req.json().catch(() => null)) as (MeetRequestBody & { confId: string }) | null;
  if (!body?.confId || !body.toUserId) return error("confId and toUserId are required");
  const from = decodeURIComponent(params.id);
  const actor = callerId(req, body);
  if (actor && actor !== from) return error("you can only send meet requests as yourself", 403);
  try {
    return json<MeetRequest>(await requestMeet(from, { ...body, proposal: body.proposal ?? {} }));
  } catch (e) {
    if (e instanceof MeetError) return error(e.message, e.status);
    throw e;
  }
});
