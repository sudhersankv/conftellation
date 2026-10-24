"use client";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/ui/cn";

export function Skeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-busy="true" className={cn("flex flex-col gap-3", className)}>
      {Array.from({ length: rows }, (_, i) => <div key={i} className="h-16 rounded-card bg-nebula/60" />)}
      <span className="sr-only">Loading</span>
    </div>
  );
}

export function EmptyState({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center py-10 text-center">
      <p className="text-body text-dust">{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-4 py-10 text-center">
      <p className="text-body text-dust">{`Couldn't load ${what}. Check your connection and try again.`}</p>
      <Button variant="ghost" onClick={onRetry}>Try again</Button>
    </div>
  );
}
