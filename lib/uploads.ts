// Capture media on local disk (public/uploads; no Fly volume, so it is wiped on redeploy).
// Served by GET /api/uploads/:file because `next start` only serves public/ files that existed at build time.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic",
  "audio/webm": "webm", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/wav": "wav",
};
const TYPE = Object.fromEntries(Object.entries(EXT).map(([t, e]) => [e, t]));

export const uploadDir = () => process.env.UPLOAD_DIR ?? path.join(process.cwd(), "public", "uploads");
export const safeName = (name: string) => /^[A-Za-z0-9_-]{1,100}\.[a-z0-9]{2,5}$/.test(name);

/** Save a blob as `<id>.<ext>`; returns its browser URL. */
export async function saveUpload(id: string, file: Blob): Promise<string> {
  const ext = EXT[file.type] ?? (file.type.startsWith("image/") ? "jpg" : "bin");
  const name = `${id}.${ext}`;
  await mkdir(uploadDir(), { recursive: true });
  await writeFile(path.join(uploadDir(), name), Buffer.from(await file.arrayBuffer()));
  return `/api/uploads/${name}`;
}

export async function readUpload(name: string): Promise<{ data: Buffer; type: string } | null> {
  if (!safeName(name)) return null;
  try {
    const data = await readFile(path.join(uploadDir(), name));
    return { data, type: TYPE[name.split(".").pop()!] ?? "application/octet-stream" };
  } catch {
    return null;
  }
}
