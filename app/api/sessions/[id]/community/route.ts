// GET /api/sessions/[id]/community — ?userId= (fills myMoments; that user's notes are left out of sharedNotes)
import * as mocks from "@/mocks";
import { error, handle, json, useMocks } from "@/lib/http";
import { sessionsByIds } from "@/lib/queries/plan";
import { sessionMoments, sessionMomentTimes } from "@/lib/queries/community";
import { toSession } from "@/lib/agents/planner";
import { getCrowd, hotMoments, toMoment } from "@/lib/agents/recapper/crowd";
import type { CommunityResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const GET = handle(async (req: Request, { params }: { params: { id: string } }) => {
  if (useMocks()) return json<CommunityResponse>(mocks.community);
  const sessionId = decodeURIComponent(params.id);
  const userId = new URL(req.url).searchParams.get("userId") || null;
  const [row] = await sessionsByIds([sessionId]);
  if (!row) return error(`session ${sessionId} not found`, 404);
  const [shared, mine, times] = await Promise.all([
    sessionMoments(sessionId, { shared: true }),
    userId ? sessionMoments(sessionId, { userId }) : Promise.resolve([]),
    sessionMomentTimes(sessionId),
  ]);
  const crowdSummary = await getCrowd({ id: row.id, title: row.title, conferenceId: row.conferenceId }, shared);
  return json<CommunityResponse>({
    session: toSession(row),
    myMoments: mine.map(toMoment),
    sharedNotes: shared.filter((m) => m.userId !== userId).map((m) => ({ ...toMoment(m), author: m.author ?? m.userId })),
    crowdSummary,
    hotMoments: hotMoments(times),
  });
});
