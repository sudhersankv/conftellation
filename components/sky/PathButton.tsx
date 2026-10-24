"use client";
import { Sparkles } from "lucide-react";
import type { WhyPath } from "@/lib/types";
import { cn } from "@/lib/ui/cn";
import { useSky } from "@/lib/ui/sky-store";
import { starColor } from "@/lib/ui/tokens";

/** WhyLine for use on the sky itself: highlights in place, no "Back to" pill. */
export function PathButton({ paths, className }: { paths: WhyPath[]; className?: string }) {
  if (paths.length === 0) return null;
  const extra = paths.length - 1, text = paths[0].text;
  return (
    <button
      type="button"
      className={cn("flex min-h-12 w-full items-start gap-2 py-2 text-left text-meta text-dust hover:text-star", className)}
      onClick={() => {
        useSky.getState().focus(null);
        useSky.setState({ highlight: paths[0] });
      }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" className="mt-[5px] shrink-0" fill={starColor(paths[0].nodes[0]?.label ?? "Topic")} aria-hidden>
        <path d="M5 0 6.1 3.9 10 5 6.1 6.1 5 10 3.9 6.1 0 5 3.9 3.9Z" />
      </svg>
      <span>
        {/^why/i.test(text) ? null : <span className="text-star">Why: </span>}{text}
        {extra > 0 && <span> · +{extra} more {extra === 1 ? "reason" : "reasons"}</span>}
      </span>
      <Sparkles className="ml-auto mt-0.5 size-4 shrink-0 text-polaris" aria-hidden />
      <span className="sr-only">Show in sky</span>
    </button>
  );
}
