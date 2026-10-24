// POST /api/users/[id]/moments - multipart CreateMomentFields (build with momentForm); JSON also accepted. ?now= (ISO) for demos/tests.
import * as mocks from "@/mocks";
import { error, handle, json, useMocks } from "@/lib/http";
import { capture, MOMENT_KINDS, newMomentId, ScribeError } from "@/lib/agents/scribe";
import { momentOwner } from "@/lib/queries/moments";
import { MAX_UPLOAD_BYTES, saveUpload } from "@/lib/uploads";
import type { CreateMomentResponse, MomentKind } from "@/lib/types";

export const dynamic = "force-dynamic";

const str = (v: FormDataEntryValue | unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => {
  if (useMocks()) return json<CreateMomentResponse>(mocks.createMoment);
  const fields: Record<string, unknown> = {};
  let file: Blob | undefined;
  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    Object.assign(fields, await req.json().catch(() => ({})));
  } else {
    const form = await req.formData().catch(() => null);
    if (!form) return error("expected multipart/form-data (use momentForm) or JSON");
    for (const [k, v] of form.entries()) {
      if (typeof v === "string") fields[k] = v;
      else if (k === "file") file = v;
    }
  }

  const confId = str(fields.confId);
  const kind = str(fields.kind) as MomentKind | undefined;
  if (!confId || !kind || !MOMENT_KINDS.includes(kind)) return error(`confId and kind (${MOMENT_KINDS.join("|")}) are required`);
  const clientId = str(fields.clientId);
  if (clientId && !/^[A-Za-z0-9_-]{1,80}$/.test(clientId)) return error("clientId must be 1-80 chars of [A-Za-z0-9_-]");
  if (file && file.size > MAX_UPLOAD_BYTES) return error("file too large (max 10 MB)", 413);

  const momentId = clientId ?? newMomentId();
  const existing = clientId ? await momentOwner(clientId) : null;
  if (existing && (existing.userId !== params.id || existing.conferenceId !== confId)) {
    return error(`moment ${clientId} belongs to another capture`, 409);
  }
  let mediaUrl: string | undefined;
  if (file && file.size > 0 && !existing) {
    const saved = await saveUpload(momentId, file);
    if (!saved.created && clientId) {
      const again = await momentOwner(clientId);
      if (again && (again.userId !== params.id || again.conferenceId !== confId)) return error(`moment ${clientId} belongs to another capture`, 409);
      // Same-owner retry: capture returns the stored moment. No moment yet: keep the existing file's url.
      if (!again) mediaUrl = saved.url;
    } else {
      mediaUrl = saved.url;
    }
  }
  try {
    const res = await capture({
      userId: params.id, confId, kind, momentId, mediaUrl,
      now: new URL(req.url).searchParams.get("now") ?? process.env.DEMO_NOW ?? undefined,
      text: str(fields.text), targetId: str(fields.targetId), personId: str(fields.personId),
      newPersonName: str(fields.newPersonName), newPersonCompany: str(fields.newPersonCompany),
      shared: fields.shared === true || fields.shared === "true",
    });
    return json<CreateMomentResponse>(res);
  } catch (e) {
    if (e instanceof ScribeError) return error(e.message, e.status);
    throw e;
  }
});
