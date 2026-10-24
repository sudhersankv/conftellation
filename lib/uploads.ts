// Capture media on local disk (public/uploads; no Fly volume, so it is wiped on redeploy).
// Served by GET /api/uploads/:file because `next start` only serves public/ files that existed at build time.
import { mkdir, open, readFile } from "node:fs/promises";
import path from "node:path";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic",
  "audio/webm": "webm", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/wav": "wav",
};
const TYPE = Object.fromEntries(Object.entries(EXT).map(([t, e]) => [e, t]));

export const uploadDir = () => process.env.UPLOAD_DIR ?? path.join(process.cwd(), "public", "uploads");
export const safeName = (name: string) => /^[A-Za-z0-9_-]{1,100}\.[a-z0-9]{2,5}$/.test(name);

/**
 * Save a blob as `<id>.<ext>`. An existing file is left untouched (`created: false`)
 * so a rejected or retried capture cannot replace the original bytes.
 */
export async function saveUpload(id: string, file: Blob): Promise<{ url: string; created: boolean }> {
  const ext = EXT[file.type] ?? (file.type.startsWith("image/") ? "jpg" : "bin");
  const name = `${id}.${ext}`;
  const dest = path.join(uploadDir(), name);
  await mkdir(uploadDir(), { recursive: true });
  const url = `/api/uploads/${name}`;
  try {
    const fh = await open(dest, "wx");
    try {
      await fh.writeFile(Buffer.from(await file.arrayBuffer()));
    } finally {
      await fh.close();
    }
    return { url, created: true };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") return { url, created: false };
    throw e;
  }
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
