import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

/** Surface container. `interactive` adds hover + pointer for clickable cards. */
export function Card({ className, interactive, accent, ...rest }: HTMLAttributes<HTMLDivElement> & { interactive?: boolean; accent?: string }) {
  return (
    <div
      className={cn("rounded-lg border border-border bg-surface p-4", interactive && "cursor-pointer transition duration-fast hover:border-borderStrong hover:bg-surface2", className)}
      style={accent ? { borderLeft: `3px solid ${accent}` } : undefined}
      {...rest}
    />
  );
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn("text-sm font-semibold leading-5 text-text", className)}>{children}</h3>;
}

export function CardMeta({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted", className)}>{children}</div>;
}

/** Page section header with optional right-side action. */
export function SectionHeader({ title, count, action, className }: { title: string; count?: number; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-center justify-between", className)}>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
        {title}{count !== undefined && <span className="ml-1.5 text-faint">{count}</span>}
      </h2>
      {action}
    </div>
  );
}
