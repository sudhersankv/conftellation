"use client";
import type { ReactNode } from "react";
import { Drawer as V } from "vaul";
import { X } from "lucide-react";
import { cn } from "@/lib/ui/cn";

interface DrawerProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  /** Right-side panel on md+ (default) or centered dialog. */
  side?: "right" | "center";
}

/** Bottom sheet on phones, right panel on md+. One Drawer per page is plenty. */
export function Drawer({ open, onOpenChange, title, description, children, className, side = "right" }: DrawerProps) {
  return (
    <V.Root open={open} onOpenChange={onOpenChange}>
      <V.Portal>
        <V.Overlay className="fixed inset-0 z-40 bg-ink/20" />
        <V.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] flex-col rounded-t-2xl border-2 border-border bg-surface text-text shadow-hardLg outline-none",
            side === "right" ? "md:inset-y-3 md:left-auto md:right-3 md:max-h-none md:w-[440px] md:rounded-2xl" : "md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[520px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl",
            className,
          )}
        >
          <V.Handle className="mx-auto mt-2 !h-1 !w-8 shrink-0 rounded-full !bg-ink md:hidden" />
          <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-3">
            <div className="min-w-0">
              <V.Title className="font-heading text-lg font-bold leading-6 tracking-tight">{title}</V.Title>
              {description ? <V.Description className="mt-0.5 text-xs text-muted">{description}</V.Description> : <V.Description className="sr-only">{title}</V.Description>}
            </div>
            <button type="button" onClick={() => onOpenChange(false)} className="grid size-8 place-items-center rounded-full border-2 border-border bg-surface text-text shadow-hardSm hover:bg-accent" aria-label="Close">
              <X className="size-4" />
            </button>
          </div>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-1">{children}</div>
        </V.Content>
      </V.Portal>
    </V.Root>
  );
}
