// POST /api/users/[id]/meet — Body: MeetRequestBody & { confId } → pending MeetRequest (a repeat to the same user updates the open one).
import * as mocks from "@/mocks";
import { error, handle, json, useMocks } from "@/lib/http";
import { MeetError, requestMeet } from "@/lib/agents/network";
import type { MeetRequest, MeetRequestBody } from "@/lib/types";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => {
  if (useMocks()) return json<MeetRequest>(mocks.meetRequest);
  const body = (await req.json().catch(() => null)) as (MeetRequestBody & { confId: string }) | null;
  if (!body?.confId || !body.toUserId) return error("confId and toUserId are required");
  try {
    return json<MeetRequest>(await requestMeet(params.id, { ...body, proposal: body.proposal ?? {} }));
  } catch (e) {
    if (e instanceof MeetError) return error(e.message, e.status);
    throw e;
  }
});
