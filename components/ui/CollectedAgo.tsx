"use client";
import { Database } from "lucide-react";
import { ago } from "@/lib/ui/format";
import { cn } from "@/lib/ui/cn";

/** Provenance chip for scraped data: "Collected 2h ago", linking to the source page. */
export function CollectedAgo({ at, source, className }: { at?: string; source?: string; className?: string }) {
  if (!at) return null;
  const cls = cn("inline-flex items-center gap-1 text-xs text-faint", className);
  const text = `Collected ${ago(at)}`;
  const inner = <><Database className="size-3" aria-hidden />{text}</>;
  return source ? (
    <a href={source} target="_blank" rel="noopener noreferrer" className={cn(cls, "hover:text-muted hover:underline underline-offset-2")} suppressHydrationWarning>{inner}</a>
  ) : (
    <span className={cls} suppressHydrationWarning>{inner}</span>
  );
}
