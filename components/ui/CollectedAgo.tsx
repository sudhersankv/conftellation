"use client";
import { ago } from "@/lib/ui/format";
import { cn } from "@/lib/ui/cn";

export function CollectedAgo({ at, source, className }: { at?: string; source?: string; className?: string }) {
  if (!at) return null;
  const cls = cn("text-micro text-dust", className);
  const text = `Collected ${ago(at)}`; // clocks differ server vs client
  return source ? (
    <a href={source} target="_blank" rel="noopener noreferrer" className={cn(cls, "underline-offset-2 hover:underline")} suppressHydrationWarning>{text}</a>
  ) : (
    <span className={cls} suppressHydrationWarning>{text}</span>
  );
}
