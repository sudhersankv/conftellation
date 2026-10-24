"use client";
import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import type { PlanItem, PlanResponse } from "@/lib/types";
import { api } from "@/lib/client";
import { useSession } from "@/lib/ui/session-context";
import { Button } from "@/components/ui";
import { cn } from "@/lib/ui/cn";

/** "Not for me" / "More like this" → api.feedback, then mutate the cached plan. */
export function FeedbackButtons({ item, onPlan, className, size = "sm" }: { item: PlanItem; onPlan(p: PlanResponse): void; className?: string; size?: "sm" | "md" }) {
  const { userId, confId, nowIso } = useSession();
  const [busy, setBusy] = useState<"skip" | "boost" | null>(null);
  const send = async (kind: "skip" | "boost") => {
    setBusy(kind);
    try {
      const plan = await api.feedback(userId, { confId, targetId: item.id, kind }, { now: nowIso() });
      onPlan(plan);
      toast(kind === "skip" ? `Removed “${item.title}”` : `More like “${item.title}”`, { description: "Planner re-ranked your plan." });
    } catch (e) {
      toast.error("Couldn't send feedback", { description: e instanceof Error ? e.message : undefined });
    } finally { setBusy(null); }
  };
  const h = size === "md" ? "h-10" : "h-10 md:h-8";
  return (
    <div className={cn("flex items-center gap-1.5", className)} onClick={(e) => e.stopPropagation()}>
      <Button variant="secondary" size="sm" className={h} loading={busy === "skip"} disabled={!!busy} onClick={() => send("skip")}>
        {busy !== "skip" && <ThumbsDown className="size-3.5" aria-hidden />}Not for me
      </Button>
      <Button variant="secondary" size="sm" className={h} loading={busy === "boost"} disabled={!!busy} onClick={() => send("boost")}>
        {busy !== "boost" && <ThumbsUp className="size-3.5" aria-hidden />}More like this
      </Button>
    </div>
  );
}
