"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Drawer as V } from "vaul";
import { cn } from "@/lib/ui/cn";

interface DrawerProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  description?: string;
  snapPoints?: (number | string)[];
  children: ReactNode;
  className?: string;
}

export function Drawer({ open, onOpenChange, title, description, snapPoints, children, className }: DrawerProps) {
  const [snap, setSnap] = useState<number | string | null>(snapPoints?.[0] ?? null);
  useEffect(() => { if (open) setSnap(snapPoints?.[0] ?? null); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- reopen at the first stop
  return (
    <V.Root
      open={open}
      onOpenChange={onOpenChange}
      {...(snapPoints ? { snapPoints, activeSnapPoint: snap, setActiveSnapPoint: setSnap } : {})}
    >
      <V.Portal>
        <V.Overlay className="fixed inset-0 z-40 bg-abyss/60" />
        <V.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-sheet border-t border-hairline bg-ink text-star outline-none",
            snapPoints ? "h-[96dvh]" : "max-h-[90dvh]",
            "md:left-auto md:right-4 md:w-[420px]",
            className,
          )}
        >
          <V.Handle className="mx-auto mt-3 !h-1 !w-10 shrink-0 rounded-full !bg-hairline" />
          <V.Title className="px-4 pt-4 text-title">{title}</V.Title>
          {description ? <V.Description className="px-4 text-meta text-dust">{description}</V.Description> : <V.Description className="sr-only">{title}</V.Description>}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-3">{children}</div>
        </V.Content>
      </V.Portal>
    </V.Root>
  );
}
