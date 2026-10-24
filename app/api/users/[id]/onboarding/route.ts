// POST /api/users/[id]/onboarding — Body: OnboardingRequest
// STUB: returns mocks until the real handler lands (see GitHub issues).
import * as mocks from "@/mocks";
import { json } from "@/lib/http";
import type { OnboardingResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST() {
  return json<OnboardingResponse>(mocks.onboarding);
}
