// GET /api/users/[id]/network — ?confId=&now= → overlapping users (Q7), shared topics, mutual free slots, meet requests.
// Polled every ~5 s by the UI. Unknown user/conference → 200 empty.
import * as mocks from "@/mocks";
import { error, handle, json, useMocks } from "@/lib/http";
import { getNetwork } from "@/lib/agents/network";
import type { NetworkResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request, { params }: { params: { id: string } }) => {
  if (useMocks()) return json<NetworkResponse>(mocks.network);
  const url = new URL(req.url);
  const confId = url.searchParams.get("confId");
  if (!confId) return error("confId is required");
  const now = url.searchParams.get("now") ?? process.env.DEMO_NOW ?? new Date().toISOString();
  return json<NetworkResponse>(await getNetwork(params.id, confId, now));
});
