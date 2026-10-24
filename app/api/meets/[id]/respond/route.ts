// POST /api/meets/[id]/respond — Body: MeetRespondBody. accept → Meet node both users ATTEND (shows as a `meet` item in both plans).
import * as mocks from "@/mocks";
import { error, handle, json, useMocks } from "@/lib/http";
import { MeetError, respondMeet } from "@/lib/agents/network";
import type { MeetRequest, MeetRespondBody } from "@/lib/types";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => {
  if (useMocks()) return json<MeetRequest>(mocks.meetRequest);
  const body = (await req.json().catch(() => null)) as MeetRespondBody | null;
  if (!body || !["accept", "decline", "counter"].includes(body.action)) return error("action (accept|decline|counter) is required");
  const now = new URL(req.url).searchParams.get("now") ?? process.env.DEMO_NOW ?? new Date().toISOString();
  try {
    return json<MeetRequest>(await respondMeet(decodeURIComponent(params.id), body, now));
  } catch (e) {
    if (e instanceof MeetError) return error(e.message, e.status);
    throw e;
  }
});
