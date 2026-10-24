// GET /api/users/[id]/intros — ?confId= → warm intros (Q5) + met before (Q6). Unknown user/conference → 200 empty.
import * as mocks from "@/mocks";
import { error, handle, json, useMocks } from "@/lib/http";
import { getIntros } from "@/lib/agents/network";
import type { IntrosResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request, { params }: { params: { id: string } }) => {
  if (useMocks()) return json<IntrosResponse>(mocks.intros);
  const confId = new URL(req.url).searchParams.get("confId");
  if (!confId) return error("confId is required");
  return json<IntrosResponse>(await getIntros(params.id, confId));
});
