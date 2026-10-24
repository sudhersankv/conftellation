// POST /api/meets/[id]/respond — Body: MeetRespondBody, plus the acting user (body `userId`, `x-user-id`, `?userId=`, or the `ptc_user` cookie).
// accept → Meet node both users ATTEND (shows as a `meet` item in both plans). Only the person the request (or the latest counter)
// waits on may accept or decline it; either participant may counter, or cancel an accepted meet. Anyone else → 403.
import * as mocks from "@/mocks";
import { callerId, error, handle, json, useMocks } from "@/lib/http";
import { MeetError, respondMeet } from "@/lib/agents/network";
import type { MeetRequest, MeetRespondBody } from "@/lib/types";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => {
  if (useMocks()) return json<MeetRequest>(mocks.meetRequest);
  const body = (await req.json().catch(() => null)) as MeetRespondBody | null;
  if (!body || !["accept", "decline", "counter"].includes(body.action)) return error("action (accept|decline|counter) is required");
  const actor = callerId(req, body);
  if (!actor) return error("userId of the acting user is required", 401);
  const now = new URL(req.url).searchParams.get("now") ?? process.env.DEMO_NOW ?? new Date().toISOString();
  try {
    return json<MeetRequest>(await respondMeet(decodeURIComponent(params.id), body, now, actor));
  } catch (e) {
    if (e instanceof MeetError) return error(e.message, e.status);
    throw e;
  }
});
