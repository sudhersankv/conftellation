// GET /api/users/[id]/constellation - ?confId= (all attended conferences if omitted) &now= (ISO; for demos/tests)
import * as mocks from "@/mocks";
import { handle, json, useMocks } from "@/lib/http";
import { buildConstellation } from "@/lib/constellation";
import type { ConstellationResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request, { params }: { params: { id: string } }) => {
  if (useMocks()) return json<ConstellationResponse>(mocks.constellation);
  const url = new URL(req.url);
  const sky = await buildConstellation(params.id, url.searchParams.get("confId"), {
    now: url.searchParams.get("now") ?? process.env.DEMO_NOW ?? undefined,
  });
  return json<ConstellationResponse>(sky);
});
