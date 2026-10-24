"use client";
// Floating controls over the Sky: Today/All, legend, zoom out, highlight caption.
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { useEffect } from "react";
import { Play, ZoomOut } from "lucide-react";
import { Legend } from "@/components/sky/Legend";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/ui/cn";
import { fmtTime } from "@/lib/ui/format";
import { useSky } from "@/lib/ui/sky-store";
import { useSkyView } from "@/lib/ui/sky/view-store";

const GLASS = "border border-hairline bg-ink/72 backdrop-blur-xl";
const TOP = "top-[calc(env(safe-area-inset-top)+64px)]";
const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const PILLS = "bottom-[calc(env(safe-area-inset-bottom)+80px)]";

export function SkyControls() {
  const scope = useSkyView((s) => s.scope);
  const setScope = useSkyView((s) => s.setScope);
  const highlight = useSky((s) => s.highlight);
  const returnTo = useSky((s) => s.returnTo);
  const replay = useSkyView((s) => s.replay);
  const pulseReplay = useSkyView((s) => s.pulseReplay);
  const reduced = useSkyView((s) => s.reduced);
  const playing = !!replay?.playing;

  // 8 s planetarium time-lapse; the loop lives here, the canvas only reads the cursor
  useEffect(() => {
    if (!playing) return;
    const { from, to } = useSkyView.getState().replay!;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 8000);
      useSkyView.getState().setCursor(from + (to - from) * ease(p));
      if (p >= 1) useSkyView.getState().stopReplay(); else raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  useEffect(() => () => useSkyView.getState().stopReplay(), []);

  return (
    <>
      <ToggleGroup.Root
        type="single"
        value={scope}
        aria-label="Show"
        onValueChange={(v) => { if (v === "today" || v === "all") setScope(v); }}
        className={cn("pointer-events-auto fixed left-4 flex rounded-full p-1", GLASS, TOP)}
      >
        {(["today", "all"] as const).map((v) => (
          <ToggleGroup.Item
            key={v}
            value={v}
            className={cn("min-h-[44px] rounded-full px-4 text-meta capitalize transition-colors duration-tap focus-visible:outline focus-visible:outline-2 focus-visible:outline-polaris", scope === v ? "bg-nebula text-star" : "text-dust")}
          >
            {v}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
      <div className={cn("pointer-events-none fixed right-4", TOP)}><Legend /></div>

      {highlight && (
        <div className={cn("pointer-events-auto fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+144px)] mx-auto flex max-w-md items-center gap-3 rounded-card px-4 py-2", GLASS)}>
          <p className="min-w-0 flex-1 text-meta">{highlight.text}</p>
          <Button variant="quiet" className="h-10 shrink-0 px-3" onClick={() => useSky.getState().clearHighlight()}>Clear</Button>
        </div>
      )}

      {playing && <button type="button" aria-label="Stop replay" className="pointer-events-auto fixed inset-0 z-20 cursor-default" onClick={() => useSkyView.getState().stopReplay()} />}
      {replay && (
        <div className="pointer-events-none fixed left-4 top-[calc(env(safe-area-inset-top)+64px+44px+16px)] w-40">
          {replay.playing ? (
            <div className="h-0.5 w-full rounded-full bg-hairline" aria-hidden>
              <div className="h-full rounded-full bg-polaris" style={{ width: `${((replay.cursor - replay.from) / (replay.to - replay.from)) * 100}%` }} />
            </div>
          ) : (
            <input
              type="range"
              aria-label="Replay time"
              min={replay.from}
              max={replay.to}
              step={60000}
              value={replay.cursor}
              onChange={(e) => useSkyView.getState().setCursor(Number(e.target.value))}
              className="pointer-events-auto h-8 w-full accent-polaris"
            />
          )}
          <p className="mt-1 text-micro tabular-nums text-dust">{fmtTime(new Date(replay.cursor).toISOString())}</p>
          {!replay.playing && <Button variant="quiet" className="pointer-events-auto mt-2 h-10 px-3" onClick={() => useSkyView.getState().stopReplay()}>Done</Button>}
        </div>
      )}

      {!returnTo && !replay && (
        <div className={cn("pointer-events-none fixed inset-x-0 flex justify-center gap-3", PILLS)}>
          <Button variant="ghost" className={cn("pointer-events-auto", GLASS, pulseReplay && !reduced && "animate-pulse")} onClick={() => useSkyView.getState().startReplay()}>
            <Play className="size-4" aria-hidden />Replay day
          </Button>
          <Button variant="ghost" className={cn("pointer-events-auto", GLASS)} onClick={() => useSky.getState().zoomOut()}>
            <ZoomOut className="size-4" aria-hidden />Zoom out
          </Button>
        </div>
      )}
    </>
  );
}
