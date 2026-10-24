"use client";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/ui/cn";

export function Skeleton({ rows = 3, className, rowClassName }: { rows?: number; className?: string; rowClassName?: string }) {
  return (
    <div role="status" aria-busy="true" className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: rows }, (_, i) => <div key={i} className={cn("h-14 animate-pulse rounded-xl border border-dashed border-border bg-surface2", rowClassName)} />)}
      <span className="sr-only">Loading</span>
    </div>
  );
}

export function EmptyState({ title, text, action, icon }: { title?: string; text: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border-2 border-dashed border-border bg-surface2 px-6 py-10 text-center">
      {icon && <div className="mb-3 text-text">{icon}</div>}
      {title && <p className="font-heading text-base font-bold text-text">{title}</p>}
      <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ what, onRetry, detail }: { what: string; onRetry?: () => void; detail?: string }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border-2 border-border bg-[#FFE3E4] px-6 py-8 text-center shadow-hard">
      <p className="font-heading text-sm font-bold text-text">{`Couldn't load ${what}.`}</p>
      {detail && <p className="max-w-md break-words text-xs text-muted">{detail}</p>}
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

/** Inline status line, e.g. "Scout found 574 sessions". */
export function StatusLine({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-xs text-muted", className)}>{children}</p>;
}
