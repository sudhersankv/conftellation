import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

const KINDS = {
  time: "tabular text-text",
  room: "text-muted",
  booth: "border-booth/40 text-booth",
  topic: "text-muted",
  goal: "border-goal/40 text-goal",
  status: "text-muted",
  accent: "border-accent/40 text-accentStrong bg-accent/10",
} as const;

export type ChipKind = keyof typeof KINDS;

/** Small inline label: time, room/booth, topic, goal, status. */
export function Chip({ kind = "topic", children, className, dot }: { kind?: ChipKind; children: ReactNode; className?: string; dot?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-md border border-border bg-surface px-2 text-xs leading-none", KINDS[kind], className)}>
      {dot && <span className="size-1.5 shrink-0 rounded-full" style={{ background: dot }} aria-hidden />}
      {children}
    </span>
  );
}
