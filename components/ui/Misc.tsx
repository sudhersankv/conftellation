import type { ReactNode } from "react";
import type { SkyNodeType } from "@/lib/types";
import { cn } from "@/lib/ui/cn";
import { TYPE_COLOR, TYPE_LABEL } from "@/lib/ui/tokens";
import { initials } from "@/lib/ui/session-context";

/** Small coloured dot for a node type. */
export function TypeDot({ type, className, size = 9 }: { type: SkyNodeType; className?: string; size?: number }) {
  return <span className={cn("inline-block shrink-0 rounded-full ring-[1.5px] ring-ink", className)} style={{ width: size, height: size, background: TYPE_COLOR[type] }} title={TYPE_LABEL[type]} aria-hidden />;
}

const AVATAR_FILLS = ["#FFD23F", "#FF6FAE", "#4DA3FF", "#FF8C42", "#A78BFA", "#3DDC97"];
function fillFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_FILLS[h % AVATAR_FILLS.length];
}

export function Avatar({ name, size = "md", className, color }: { name: string; size?: "sm" | "md" | "lg"; className?: string; color?: string }) {
  const s = { sm: "size-7 text-[10px]", md: "size-9 text-xs", lg: "size-12 text-sm" }[size];
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full border-2 border-border font-heading font-bold text-ink", s, className)} style={{ background: color ?? fillFor(name) }} aria-hidden>
      {initials(name)}
    </span>
  );
}

/** Page title row: title, optional subtitle, right-side actions. */
export function PageHeader({ title, subtitle, actions, className, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; className?: string; eyebrow?: ReactNode }) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-2 inline-flex items-center rounded-full border-2 border-border bg-accent px-2.5 py-0.5 font-heading text-[11px] font-bold uppercase tracking-wide text-ink">{eyebrow}</div>}
        <h1 className="font-heading text-[28px] font-bold leading-[1.05] tracking-tight md:text-4xl">{title}</h1>
        {subtitle && <div className="mt-2 text-sm text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Segmented control (Day | By goal, Today | All). */
export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div role="tablist" className={cn("inline-flex h-10 items-center gap-0.5 rounded-full border-2 border-border bg-surface p-0.5 shadow-hardSm", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn("h-full rounded-full px-3.5 font-heading text-sm font-bold transition duration-fast", o.value === value ? "bg-ink text-cream" : "text-muted hover:bg-accent/40 hover:text-text")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
