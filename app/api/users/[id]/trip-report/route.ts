// GET /api/users/[id]/trip-report — ?confId=&regenerate=1 (DEMO_MODE=true serves the stored report unless regenerate=1)
import * as mocks from "@/mocks";
import { error, handle, json, useMocks } from "@/lib/http";
import { getTripReport } from "@/lib/agents/recapper";
import type { TripReportResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const GET = handle(async (req: Request, { params }: { params: { id: string } }) => {
  if (useMocks()) return json<TripReportResponse>(mocks.tripReport);
  const url = new URL(req.url);
  const confId = url.searchParams.get("confId");
  if (!confId) return error("confId is required");
  const regenerate = ["1", "true"].includes(url.searchParams.get("regenerate") ?? "");
  return json<TripReportResponse>(await getTripReport(params.id, confId, { regenerate }));
});
