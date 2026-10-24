// POST /api/users/[id]/steer — Body: SteerRequest (ops present → applied directly, no LLM). ?now= for demos/tests.
import * as mocks from "@/mocks";
import { error, handle, json, useMocks } from "@/lib/http";
import { NotFound } from "@/lib/agents/planner";
import { runSteer } from "@/lib/agents/steer";
import type { SteerRequest, SteerResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => {
  if (useMocks()) return json<SteerResponse>(mocks.steer);
  const body = (await req.json().catch(() => null)) as SteerRequest | null;
  if (!body?.confId || (typeof body.text !== "string" && !Array.isArray(body.ops))) return error("confId and text (or ops) are required");
  if (body.ops !== undefined && !Array.isArray(body.ops)) return error("ops must be an array");
  try {
    const out = await runSteer(params.id, body.confId, {
      text: body.text ?? "", ops: body.ops, now: new URL(req.url).searchParams.get("now") ?? process.env.DEMO_NOW ?? undefined,
    });
    return json<SteerResponse>(out);
  } catch (e) {
    if (e instanceof NotFound) return error(e.message, 404);
    throw e;
  }
});
