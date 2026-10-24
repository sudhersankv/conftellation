// POST /api/moments/[id]/share - Body: {to: userIds[] | "network", userId} ("network" = visible in the session community; [] = private again)
// userId is the demo caller (no auth). Only that user can change sharing when they own the moment.
import * as mocks from "@/mocks";
import { error, handle, json, useMocks } from "@/lib/http";
import { momentById, shareMoment } from "@/lib/queries/moments";
import type { Moment } from "@/lib/types";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => {
  if (useMocks()) return json<Moment>(mocks.createMoment.moment);
  const body = (await req.json().catch(() => null)) as { to?: unknown; userId?: unknown } | null;
  const to = body?.to;
  const fromBody = typeof body?.userId === "string" ? body.userId.trim() : "";
  const userId = fromBody || new URL(req.url).searchParams.get("userId")?.trim() || "";
  if (!userId) return error("userId is required");
  if (!(to === "network" || (Array.isArray(to) && to.every((x) => typeof x === "string")))) return error(`to must be "network" or a list of user ids`);
  if (!(await shareMoment(params.id, to as string[] | "network", userId))) {
    if (!(await momentById(params.id))) return error(`moment ${params.id} not found`, 404);
    return error(`only the owner can share moment ${params.id}`, 403);
  }
  const moment = await momentById(params.id);
  if (!moment) return error(`moment ${params.id} not found`, 404);
  return json<Moment>(moment);
});
