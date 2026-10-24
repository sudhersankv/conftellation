import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

const KINDS = {
  time: "tabular-nums",
  room: "text-dust",
  booth: "border-aurora/40 text-aurora",
  topic: "text-dust",
  goal: "",
} as const;

export function Chip({ kind = "topic", children, className }: { kind?: keyof typeof KINDS; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-7 items-center gap-1.5 rounded-full border border-hairline bg-nebula/60 px-2.5 text-micro text-star", KINDS[kind], className)}>
      {kind === "goal" && <span className="size-1.5 rounded-full bg-sun" aria-hidden />}
      {children}
    </span>
  );
}
