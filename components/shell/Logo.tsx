import { cn } from "@/lib/ui/cn";

/** Three joined dots (an open triangle) in an ink-outlined tile. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn("inline-grid shrink-0 place-items-center rounded-[8px] border-2 border-border bg-surface shadow-hardSm", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" width={size - 8} height={size - 8} fill="none">
        <path d="M4.5 9 L11 18 L19.5 5.5" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="4.5" cy="9" r="2.6" fill="#111" />
        <circle cx="11" cy="18" r="2.6" fill="#111" />
        <circle cx="19.5" cy="5.5" r="3.4" fill="#FFD23F" stroke="#111" strokeWidth="2" />
      </svg>
    </span>
  );
}

export function Logo({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark size={size} />
      <span className="font-heading text-base font-bold tracking-tight text-ink">Conftellations</span>
    </span>
  );
}
