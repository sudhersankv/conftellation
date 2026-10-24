// POST /api/users/[id]/feedback — Body: FeedbackRequest -> updated plan
import * as mocks from "@/mocks";
import { error, handle, json, useMocks } from "@/lib/http";
import { NotFound, runPlanner } from "@/lib/agents/planner";
import { writeFeedback } from "@/lib/queries/feedback";
import type { FeedbackRequest, PlanResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => {
  if (useMocks()) return json<PlanResponse>(mocks.plan);
  const body = (await req.json().catch(() => null)) as FeedbackRequest | null;
  if (!body?.confId || !body.targetId || !["skip", "boost"].includes(body.kind)) return error("confId, targetId and kind (skip|boost) are required");
  if (!(await writeFeedback(params.id, body.targetId, body.kind))) return error(`user or target not found`, 404);
  try {
    const { plan } = await runPlanner(params.id, body.confId, { write: true, now: new URL(req.url).searchParams.get("now") ?? process.env.DEMO_NOW ?? undefined });
    return json<PlanResponse>(plan);
  } catch (e) {
    if (e instanceof NotFound) return error(e.message, 404);
    throw e;
  }
});
