"use client";
import { useEffect, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/ui/cn";
import { EASE } from "@/lib/ui/tokens";
import { useSky } from "@/lib/ui/sky-store";

// Fixed: 112 = 56px top bar + 56px live sky strip; 64 = tab bar. Fixed keeps the (sky) wrapper zero-height.
const BASE = "fixed inset-x-0 z-20 top-[calc(env(safe-area-inset-top)+112px)] bottom-[calc(env(safe-area-inset-bottom)+64px)] overflow-y-auto overscroll-contain rounded-t-sheet border-t border-hairline bg-ink/72 px-4 pb-8 pt-5 backdrop-blur-xl md:bottom-[calc(64px+16px)] md:left-auto md:right-4 md:top-[calc(56px+16px)] md:w-[420px] md:rounded-sheet md:border";

let mounted = 0; // sheets currently mounted (tab switches swap one for another)

export function Sheet({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  const covered = useSky((s) => s.covered);
  const reduce = useReducedMotion();
  const [initialCovered] = useState(covered); // switching Plan -> Capture: no re-rise
  useEffect(() => {
    mounted++;
    useSky.getState().setCovered(true);
    return () => {
      mounted--;
      setTimeout(() => { if (mounted === 0) useSky.getState().setCovered(false); }, 0); // deferred: no flicker when one sheet replaces another
    };
  }, []);
  return (
    <motion.section
      aria-label={title}
      className={cn(BASE, className)}
      initial={initialCovered ? false : { y: "100%" }}
      animate={{ y: covered ? 0 : "100%" }}
      transition={reduce ? { duration: 0 } : { duration: 0.32, ease: EASE.expo }}
    >
      {title && <h1 className="mb-4 font-display text-display">{title}</h1>}
      {children}
    </motion.section>
  );
}
