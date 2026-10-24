"use client";
import { useState } from "react";

/** Photo inside an Avatar circle; renders the initials fallback if the image fails to load. */
export function AvatarPhoto({ src, fallback }: { src: string; fallback: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (failed === src) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote conference-site photos, no next/image domain config
    <img src={src} alt="" referrerPolicy="no-referrer" loading="lazy" decoding="async" onError={() => setFailed(src)} className="size-full object-cover" />
  );
}
