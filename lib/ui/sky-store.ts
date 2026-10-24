// Select primitives (`useSky((s) => s.highlight)`); a selector returning a new object loops in zustand 5, use `useShallow`.
// SkyStage consumes pulses with `useSky.setState({ pulses: [] })`. Outside React use `useSky.getState().action()`.
import { create } from "zustand";
import type { WhyPath } from "@/lib/types";

export type SkyMode = "galaxy" | "conference";

export interface SkyState {
  mode: SkyMode;
  confId: string | null;
  highlight: WhyPath | null; // path to trace; null = none
  pulses: { id: string; at: number }[]; // node ids to pulse (lit), consumed by SkyStage
  returnTo: { href: string; label: string } | null; // drives BackToPill
  covered: boolean; // a sheet covers the sky -> SkyStage may pauseAnimation
  focusId: string | null; // centre + open star card for this node id
  flyTarget: string | null; // galaxy -> conference fly-in request
  showPath(path: WhyPath, returnLabel: string): void; // highlight + returnTo(current location); WhyLine pushes /sky
  clearHighlight(): void;
  pulse(ids: string[]): void;
  focus(id: string | null): void;
  flyTo(confId: string): void;
  zoomOut(): void; // back to galaxy
  setCovered(v: boolean): void;
  setMode(m: SkyMode, confId?: string | null): void;
}

export const useSky = create<SkyState>()((set) => ({
  mode: "galaxy", confId: null, highlight: null, pulses: [], returnTo: null, covered: false, focusId: null, flyTarget: null,
  showPath: (path, returnLabel) => set({
    highlight: path, covered: false, focusId: null,
    returnTo: typeof window === "undefined" ? null : { href: window.location.pathname + window.location.search, label: returnLabel },
  }),
  clearHighlight: () => set({ highlight: null, returnTo: null }),
  pulse: (ids) => set((s) => ({ pulses: [...s.pulses, ...ids.map((id) => ({ id, at: Date.now() }))].slice(-50) })),
  focus: (id) => set({ focusId: id }),
  flyTo: (confId) => set({ flyTarget: confId, confId }),
  zoomOut: () => set({ mode: "galaxy", flyTarget: null, focusId: null, highlight: null, returnTo: null }),
  setCovered: (v) => set({ covered: v }),
  setMode: (m, confId) => set(confId === undefined ? { mode: m } : { mode: m, confId }),
}));
