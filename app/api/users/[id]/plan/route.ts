// GET /api/users/[id]/plan — ?confId=&now= (now is optional, ISO; for demos/tests)
import * as mocks from "@/mocks";
import { error, handle, json, useMocks } from "@/lib/http";
import { NotFound, runPlanner } from "@/lib/agents/planner";
import type { PlanResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request, { params }: { params: { id: string } }) => {
  if (useMocks()) return json<PlanResponse>(mocks.plan);
  const url = new URL(req.url);
  const confId = url.searchParams.get("confId");
  if (!confId) return error("confId is required");
  try {
    const { plan } = await runPlanner(params.id, confId, { write: true, now: url.searchParams.get("now") ?? process.env.DEMO_NOW ?? undefined });
    return json<PlanResponse>(plan);
  } catch (e) {
    if (e instanceof NotFound)
      return json<PlanResponse>({ confId, userId: params.id, itinerary: [], byGoal: [], generatedAt: new Date().toISOString(), now: null });
    throw e;
  }
});
