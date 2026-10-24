import type { ReactNode } from "react";
import type { SkyNodeType } from "@/lib/types";
import { cn } from "@/lib/ui/cn";
import { TYPE_COLOR, TYPE_LABEL } from "@/lib/ui/tokens";
import { initials } from "@/lib/ui/session-context";

/** Small coloured dot for a node type. */
export function TypeDot({ type, className, size = 8 }: { type: SkyNodeType; className?: string; size?: number }) {
  return <span className={cn("inline-block shrink-0 rounded-full", className)} style={{ width: size, height: size, background: TYPE_COLOR[type] }} title={TYPE_LABEL[type]} aria-hidden />;
}

export function Avatar({ name, size = "md", className, color }: { name: string; size?: "sm" | "md" | "lg"; className?: string; color?: string }) {
  const s = { sm: "size-6 text-[10px]", md: "size-8 text-xs", lg: "size-11 text-sm" }[size];
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full border border-border bg-surface2 font-semibold text-text", s, className)} style={color ? { borderColor: color } : undefined} aria-hidden>
      {initials(name)}
    </span>
  );
}

/** Page title row: title, optional subtitle, right-side actions. */
export function PageHeader({ title, subtitle, actions, className, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; className?: string; eyebrow?: ReactNode }) {
  return (
    <div className={cn("mb-5 flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-medium uppercase tracking-wider text-muted">{eyebrow}</div>}
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Segmented control (Day | By goal, Today | All). */
export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div role="tablist" className={cn("inline-flex h-9 items-center rounded-lg border border-border bg-surface p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn("h-full rounded-md px-3 text-sm transition duration-fast", o.value === value ? "bg-surface2 text-text" : "text-muted hover:text-text")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
