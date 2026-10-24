"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useSky } from "@/lib/ui/sky-store";

export function BackToPill() {
  const returnTo = useSky((s) => s.returnTo);
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    // user left Sky another way: drop the highlight
    if (pathname !== "/sky" && useSky.getState().returnTo) useSky.getState().clearHighlight();
  }, [pathname]);
  if (!returnTo || pathname !== "/sky") return null;
  return (
    <button
      type="button"
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+80px)] left-1/2 z-40 inline-flex h-12 -translate-x-1/2 items-center gap-2 rounded-full border border-hairline bg-ink/72 px-5 text-meta text-star backdrop-blur-xl"
      onClick={() => {
        const href = returnTo.href;
        useSky.getState().clearHighlight();
        router.push(href);
      }}
    >
      <ChevronLeft className="size-4" aria-hidden />
      {returnTo.label}
    </button>
  );
}
