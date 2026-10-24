"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/client";
import { hashSeed, mulberry32 } from "@/lib/ui/rand";
import { initials, useSession, userName } from "@/lib/ui/session-context";
import { useSky } from "@/lib/ui/sky-store";
import { apiKey, useApi } from "@/lib/ui/use-api";

/** #12 swaps this for the galaxy's MST shape. */
export function ConstellationGlyph({ seed, size = 20 }: { seed: string; size?: number }) {
  const r = mulberry32(hashSeed(seed));
  const pts = Array.from({ length: 5 }, () => [2 + r() * (size - 4), 2 + r() * (size - 4)] as const);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0">
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="#A78BFA" strokeOpacity={0.6} strokeWidth={1} />
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={1.3} fill="#F2F0FF" />)}
    </svg>
  );
}

export function Avatar({ userId, size = 36 }: { userId: string; size?: number }) {
  return (
    <span className="grid place-items-center rounded-full border border-hairline bg-nebula text-micro font-semibold" style={{ width: size, height: size }}>
      {initials(userName(userId))}
    </span>
  );
}

export function TopBar() {
  const { userId, confId, setUserId, otherUserId } = useSession();
  const router = useRouter();
  const { data, error } = useApi(apiKey("conference", confId), () => api.conference(confId));
  const taps = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => { useSky.getState().setMode("conference", confId); }, [confId]);
  const name = data?.conference.name ?? (error ? confId : undefined);
  return (
    <header className="fixed inset-x-0 top-0 z-30 flex h-[calc(env(safe-area-inset-top)+56px)] items-end bg-gradient-to-b from-abyss/80 to-transparent px-4 pb-1 pt-[env(safe-area-inset-top)]">
      <button
        type="button"
        aria-label="Back to your conferences"
        className="flex min-h-12 min-w-0 items-center gap-2"
        onClick={() => { useSky.getState().zoomOut(); router.push("/"); }}
      >
        <ChevronLeft className="size-4 text-dust" aria-hidden />
        <ConstellationGlyph seed={confId} />
        {name ? <span className="truncate font-name text-[17px] italic">{name}</span> : <span className="h-4 w-40 rounded-full bg-nebula/60" />}
      </button>
      <Link
        href="/me"
        aria-label={`My record, viewing as ${userName(userId).split(" ")[0]}`}
        className="ml-auto grid size-12 place-items-center"
        onClick={(e) => {
          e.preventDefault();
          taps.current++;
          clearTimeout(timer.current);
          if (taps.current >= 3) {
            taps.current = 0;
            useSky.getState().clearHighlight();
            setUserId(otherUserId);
            toast(`Viewing as ${userName(otherUserId).split(" ")[0]}`);
            return;
          }
          timer.current = setTimeout(() => { taps.current = 0; router.push("/me"); }, 280);
        }}
      >
        <Avatar userId={userId} />
      </Link>
    </header>
  );
}
