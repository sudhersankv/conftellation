import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

/** Surface container: white, 2px ink outline, hard shadow. `interactive` adds the press feel; `accent` a 6px left colour bar. */
export function Card({ className, interactive, accent, children, ...rest }: HTMLAttributes<HTMLDivElement> & { interactive?: boolean; accent?: string }) {
  return (
    <div
      className={cn("relative overflow-hidden rounded-xl border-2 border-border bg-surface p-4 shadow-hard", accent && "pl-[22px]", interactive && "press cursor-pointer", className)}
      {...rest}
    >
      {accent && <span className="pointer-events-none absolute inset-y-0 left-0 w-[6px] border-r-2 border-border" style={{ background: accent }} aria-hidden />}
      {children}
    </div>
  );
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn("font-heading text-[15px] font-bold leading-5 tracking-tight text-text", className)}>{children}</h3>;
}

export function CardMeta({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted", className)}>{children}</div>;
}

/** Page section header with optional right-side action. */
export function SectionHeader({ title, count, action, className }: { title: string; count?: number; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-center justify-between", className)}>
      <h2 className="flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-wide text-text">
        {title}{count !== undefined && <span className="inline-grid h-5 min-w-5 place-items-center rounded-full border-2 border-border bg-accent px-1.5 text-[11px] leading-none">{count}</span>}
      </h2>
      {action}
    </div>
  );
}
