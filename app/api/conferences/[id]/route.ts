// GET /api/conferences/[id] — Conference + sessions + booths + sponsors + topics. Unknown id → 404.
import * as mocks from "@/mocks";
import { error, handle, json, useMocks } from "@/lib/http";
import { toBooth, toSession } from "@/lib/agents/planner";
import { conferenceBooths, conferenceById, conferenceSessions, conferenceSponsors, conferenceTopics } from "@/lib/queries/conferences";
import type { ConferenceDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, { params }: { params: { id: string } }) => {
  if (useMocks()) return json<ConferenceDetail>(mocks.conferenceDetail);
  const conference = await conferenceById(params.id);
  if (!conference) return error(`conference ${params.id} not found`, 404);
  const [sessions, booths, sponsors, topics] = await Promise.all([
    conferenceSessions(params.id), conferenceBooths(params.id), conferenceSponsors(params.id), conferenceTopics(params.id),
  ]);
  return json<ConferenceDetail>({ conference, sessions: sessions.map(toSession), booths: booths.map(toBooth), topics, sponsors });
});
