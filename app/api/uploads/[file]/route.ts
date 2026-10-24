// GET /api/uploads/[file] - capture media saved by POST /api/users/:id/moments
// Demo access: ?userId= and/or ?momentId=. A private moment is readable only by its owner.
// Shared moments are readable with either param. Responses are not publicly cacheable.
import { error, handle } from "@/lib/http";
import { momentByMedia } from "@/lib/queries/moments";
import { readUpload, safeName } from "@/lib/uploads";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request, { params }: { params: { file: string } }) => {
  const url = new URL(req.url);
  const momentId = url.searchParams.get("momentId")?.trim() || "";
  const userId = url.searchParams.get("userId")?.trim() || "";
  if (!momentId && !userId) return error("momentId or userId is required");
  if (!safeName(params.file)) return error("not found", 404);
  const moment = await momentByMedia(params.file);
  if (!moment) return error("not found", 404);
  if (momentId && moment.id !== momentId) return error("not found", 403);
  const allowed = moment.shared || userId === moment.userId;
  if (!allowed) return error("not found", 403);
  const f = await readUpload(params.file);
  if (!f) return error("not found", 404);
  return new Response(new Uint8Array(f.data), { headers: { "Content-Type": f.type, "Cache-Control": "private, no-store" } });
});
