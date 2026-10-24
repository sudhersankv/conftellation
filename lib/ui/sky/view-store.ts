// UI-only Sky state shared between SkyStage and the sky page (the cross-screen contract lives in sky-store).
import { create } from "zustand";
import { dayKey } from "./time";
import type { ConstellationResponse, SkyLink, SkyNode } from "@/lib/types";

export interface SkyView {
  scope: "today" | "all";
  setScope(s: "today" | "all"): void;
  replay: { from: number; to: number; cursor: number; playing: boolean } | null;
  startReplay(): void;
  setCursor(ms: number): void;
  stopReplay(): void;
  legendOpen: boolean;
  setLegend(v: boolean): void;
  nodes: SkyNode[]; // snapshot written by SkyStage for the card and list
  links: SkyLink[];
  coverage: ConstellationResponse["coverage"];
  pulseReplay: boolean;
  reduced: boolean;
}

export const useSkyView = create<SkyView>()((set, get) => ({
  scope: "all", setScope: (scope) => set({ scope }),
  replay: null,
  startReplay: () => {
    const { nodes, scope } = get();
    const today = dayKey(new Date());
    const ats = nodes.filter((n) => n.at && n.state !== "skipped" && (scope === "all" || dayKey(n.at) === today)).map((n) => Date.parse(n.at!));
    const all = ats.length ? ats : nodes.filter((n) => n.at).map((n) => Date.parse(n.at!));
    if (!all.length) return;
    const from = Math.min(...all) - 5 * 60000, to = Math.max(...all) + 5 * 60000;
    set({ replay: { from, to, cursor: from, playing: !get().reduced }, pulseReplay: false });
  },
  setCursor: (cursor) => set((s) => (s.replay ? { replay: { ...s.replay, cursor } } : s)),
  stopReplay: () => set({ replay: null }),
  legendOpen: false, setLegend: (legendOpen) => set({ legendOpen }),
  nodes: [], links: [], coverage: [], pulseReplay: false, reduced: false,
}));
