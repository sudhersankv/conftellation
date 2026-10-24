"use client";
import { usePathname, useRouter } from "next/navigation";
import { useReducedMotion } from "motion/react";
import { Sparkles } from "lucide-react";
import type { WhyPath } from "@/lib/types";
import { cn } from "@/lib/ui/cn";
import { useSky } from "@/lib/ui/sky-store";
import { MOTION, starColor } from "@/lib/ui/tokens";

export function WhyLine({ paths, returnLabel = "Back to plan", className }: { paths: WhyPath[]; returnLabel?: string; className?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const reduce = useReducedMotion();
  if (paths.length === 0) return null;
  const extra = paths.length - 1;
  return (
    <button
      type="button"
      className={cn("flex min-h-12 w-full items-start gap-2 py-2 text-left text-meta text-dust hover:text-star", className)}
      onClick={(e) => {
        e.stopPropagation(); // cards can be clickable
        const path = paths[0];
        if (pathname === "/sky") { useSky.setState({ highlight: path }); return; } // star card on Sky: no pill
        useSky.getState().showPath(path, returnLabel); // highlight + returnTo + covered=false -> sheet slides down
        setTimeout(() => router.push("/sky"), reduce ? 0 : MOTION.sheet);
      }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" className="mt-[5px] shrink-0" fill={starColor(paths[0].nodes[0]?.label ?? "Topic")} aria-hidden>
        <path d="M5 0 6.1 3.9 10 5 6.1 6.1 5 10 3.9 6.1 0 5 3.9 3.9Z" />
      </svg>
      <span>
        <span className="text-star">Why:</span> {paths[0].text}
        {extra > 0 && <span> · +{extra} more {extra === 1 ? "reason" : "reasons"}</span>}
      </span>
      <Sparkles className="ml-auto mt-0.5 size-4 shrink-0 text-polaris" aria-hidden />
      <span className="sr-only">Show in sky</span>
    </button>
  );
}
