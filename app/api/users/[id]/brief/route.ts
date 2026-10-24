// GET /api/users/[id]/brief — ?confId=&date=YYYY-MM-DD&regenerate=1
// DEMO_MODE=true serves the stored (precomputed) brief; regenerate=1 runs live and returns precomputed:false.
import * as mocks from "@/mocks";
import { error, handle, json, useMocks } from "@/lib/http";
import { getBrief } from "@/lib/agents/recapper";
import type { BriefResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const GET = handle(async (req: Request, { params }: { params: { id: string } }) => {
  if (useMocks()) return json<BriefResponse>(mocks.brief);
  const url = new URL(req.url);
  const confId = url.searchParams.get("confId");
  if (!confId) return error("confId is required");
  const date = url.searchParams.get("date");
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return error("date must be YYYY-MM-DD");
  const regenerate = ["1", "true"].includes(url.searchParams.get("regenerate") ?? "");
  return json<BriefResponse>(await getBrief(params.id, confId, { date, regenerate }));
});
