"use client";
// Floating controls over the Sky: Today/All, legend, zoom out, highlight caption.
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { ZoomOut } from "lucide-react";
import { Legend } from "@/components/sky/Legend";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/ui/cn";
import { useSky } from "@/lib/ui/sky-store";
import { useSkyView } from "@/lib/ui/sky/view-store";

const GLASS = "border border-hairline bg-ink/72 backdrop-blur-xl";
const TOP = "top-[calc(env(safe-area-inset-top)+64px)]";
const PILLS = "bottom-[calc(env(safe-area-inset-bottom)+80px)]";

export function SkyControls() {
  const scope = useSkyView((s) => s.scope);
  const setScope = useSkyView((s) => s.setScope);
  const highlight = useSky((s) => s.highlight);
  const returnTo = useSky((s) => s.returnTo);

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

      {!returnTo && (
        <div className={cn("pointer-events-none fixed inset-x-0 flex justify-center gap-3", PILLS)}>
          <Button variant="ghost" className={cn("pointer-events-auto", GLASS)} onClick={() => useSky.getState().zoomOut()}>
            <ZoomOut className="size-4" aria-hidden />Zoom out
          </Button>
        </div>
      )}
    </>
  );
}
