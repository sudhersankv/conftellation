// GET /api/uploads/[file] - capture media saved by POST /api/users/:id/moments
import { error, handle } from "@/lib/http";
import { readUpload } from "@/lib/uploads";

export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, { params }: { params: { file: string } }) => {
  const f = await readUpload(params.file);
  if (!f) return error("not found", 404);
  return new Response(new Uint8Array(f.data), { headers: { "Content-Type": f.type, "Cache-Control": "public, max-age=31536000, immutable" } });
});
