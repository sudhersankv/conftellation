import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

const KINDS = {
  time: "tabular text-text",
  room: "text-text",
  booth: "bg-[#E2FAF0] text-text",
  topic: "text-muted",
  goal: "bg-[#FFF3C4] text-text",
  status: "text-muted",
  accent: "bg-accent text-text",
} as const;

export type ChipKind = keyof typeof KINDS;

/** Small inline pill: time, room/booth, topic, goal, status. */
export function Chip({ kind = "topic", children, className, dot }: { kind?: ChipKind; children: ReactNode; className?: string; dot?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full border-[1.5px] border-border bg-surface px-2.5 font-heading text-[11px] font-medium leading-none", KINDS[kind], className)}>
      {dot && <span className="size-2 shrink-0 rounded-full ring-1 ring-ink" style={{ background: dot }} aria-hidden />}
      {children}
    </span>
  );
}
