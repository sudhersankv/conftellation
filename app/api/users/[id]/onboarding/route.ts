// POST /api/users/[id]/onboarding — Body: OnboardingRequest. Creates the user if needed, ATTENDS, goals/problems, availability, first plan.
import * as mocks from "@/mocks";
import { error, handle, json, useMocks } from "@/lib/http";
import { onboard, UnknownConference } from "@/lib/agents/onboarding";
import type { OnboardingRequest, OnboardingResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => {
  if (useMocks()) return json<OnboardingResponse>(mocks.onboarding);
  const body = (await req.json().catch(() => null)) as OnboardingRequest | null;
  if (!body?.confId || !Array.isArray(body.goals)) return error("confId and goals are required");
  try {
    return json<OnboardingResponse>(await onboard(params.id, body, new URL(req.url).searchParams.get("now") ?? process.env.DEMO_NOW ?? undefined));
  } catch (e) {
    if (e instanceof UnknownConference) return error(e.message, 404);
    throw e;
  }
});
