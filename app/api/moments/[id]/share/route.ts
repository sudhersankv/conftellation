// POST /api/moments/[id]/share - Body: {to: userIds[] | "network"} ("network" = visible in the session community; [] = private again)
import * as mocks from "@/mocks";
import { error, handle, json, useMocks } from "@/lib/http";
import { momentById, shareMoment } from "@/lib/queries/moments";
import type { Moment } from "@/lib/types";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => {
  if (useMocks()) return json<Moment>(mocks.createMoment.moment);
  const body = (await req.json().catch(() => null)) as { to?: unknown } | null;
  const to = body?.to;
  if (!(to === "network" || (Array.isArray(to) && to.every((x) => typeof x === "string")))) return error(`to must be "network" or a list of user ids`);
  if (!(await shareMoment(params.id, to as string[] | "network"))) return error(`moment ${params.id} not found`, 404);
  const moment = await momentById(params.id);
  if (!moment) return error(`moment ${params.id} not found`, 404);
  return json<Moment>(moment);
});
