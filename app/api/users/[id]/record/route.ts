// GET /api/users/[id]/record — conferences the user attends (galaxy list), newest first. Unknown user → 200, no conferences.
import * as mocks from "@/mocks";
import { handle, json, useMocks } from "@/lib/http";
import { personalRecord, userRow } from "@/lib/queries/community";
import type { OpenTo, RecordResponse, Via } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, { params }: { params: { id: string } }) => {
  if (useMocks()) return json<RecordResponse>(mocks.record);
  const u = await userRow(params.id);
  if (!u) return json<RecordResponse>({ user: { id: params.id, name: params.id, openTo: [] }, conferences: [] });
  const rows = await personalRecord(params.id);
  return json<RecordResponse>({
    user: {
      id: u.id, name: u.name ?? u.id, personId: u.personId ?? undefined, availFrom: u.availFrom, availTo: u.availTo,
      openTo: (u.openTo ?? []) as OpenTo[],
    },
    conferences: rows.map((r) => ({
      conference: {
        id: r.id, name: r.name, url: r.url ?? "", startDate: r.startDate ?? "", endDate: r.endDate ?? "", city: r.city ?? undefined,
        source: r.source ?? undefined, collectedAt: r.collectedAt ?? undefined, via: (r.via ?? undefined) as Via | undefined,
      },
      sessions: r.sessions, people: r.people, moments: r.moments, hasBrief: r.hasBrief, hasTrip: r.hasTrip,
    })),
  });
});
