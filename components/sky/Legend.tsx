"use client";
import { useEffect, useRef } from "react";
import { Info } from "lucide-react";
import { STAR } from "@/lib/ui/tokens";
import { useSkyView } from "@/lib/ui/sky/view-store";

const TYPES = [
  ["Goal", STAR.goal], ["Session", STAR.session], ["Person", STAR.person], ["Booth", STAR.booth], ["Note", STAR.moment], ["Other attendee", STAR.user],
] as const;

function Dot({ color, mode }: { color: string; mode: "solid" | "ring" | "spikes" }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden className="shrink-0">
      {mode === "spikes" && <path d="M1 9H17M9 1V17" stroke={color} strokeWidth="0.8" />}
      {mode === "ring"
        ? <circle cx="9" cy="9" r="4.5" fill="none" stroke={color} strokeOpacity="0.6" strokeWidth="1.25" />
        : <><circle cx="9" cy="9" r="7" fill={color} fillOpacity="0.25" /><circle cx="9" cy="9" r="3.5" fill="#fff" /></>}
    </svg>
  );
}

export function Legend() {
  const open = useSkyView((s) => s.legendOpen);
  const setOpen = useSkyView((s) => s.setLegend);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try { if (!localStorage.getItem("ptc_legend_seen")) { localStorage.setItem("ptc_legend_seen", "1"); setOpen(true); } } catch { /* storage blocked */ }
  }, [setOpen]);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", down); document.removeEventListener("keydown", key); };
  }, [open, setOpen]);
  return (
    <div ref={root} className="pointer-events-auto relative">
      <button type="button" aria-label="Legend" aria-expanded={open} onClick={() => setOpen(!open)} className="grid size-11 place-items-center rounded-full border border-hairline bg-ink/72 text-dust backdrop-blur-xl hover:text-star">
        <Info className="size-5" aria-hidden />
      </button>
      {open && (
        <div role="dialog" aria-label="Legend" className="absolute right-0 top-12 w-64 rounded-card border border-hairline bg-ink p-4">
          <ul className="flex flex-col gap-2 text-meta">
            {TYPES.map(([name, c]) => <li key={name} className="flex items-center gap-3"><Dot color={c} mode="solid" />{name}</li>)}
          </ul>
          <hr className="my-3 border-hairline" />
          <ul className="flex flex-col gap-2 text-meta">
            <li className="flex items-center gap-3"><Dot color="#A78BFA" mode="ring" />Planned</li>
            <li className="flex items-center gap-3"><Dot color="#A78BFA" mode="solid" />Done</li>
            <li className="flex items-center gap-3"><Dot color="#A78BFA" mode="spikes" />Unplanned</li>
          </ul>
        </div>
      )}
    </div>
  );
}
