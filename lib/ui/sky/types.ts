import type { ForceGraphMethods, NodeObject, LinkObject } from "react-force-graph-2d";
import type { EdgeType, SkyNode, WhyPath } from "@/lib/types";

export type GNode = SkyNode & {
  x?: number; y?: number; vx?: number; vy?: number; fx?: number; fy?: number;
  _orig: string; // SkyNode.id (galaxy ids are namespaced `${conf}::${id}`)
  _conf: string; // conference this star is drawn in
  _r: number; // graph-space radius
  _color: string;
  _phase: number; // twinkle phase 0..2π
  _period: number; // 3000–6000 ms
  _sun?: { x: number; y: number }; // goal sun this star clusters around
  _enterAt?: number; _exitAt?: number; // performance.now() stamps for steer in/out
  _shape?: boolean; // galaxy: part of the constellation outline
  _slotAlpha?: number; // galaxy: per-conference dimming
  _hitR?: number; // galaxy: conference tap radius (graph px)
  _label: string;
};
export type LinkType = EdgeType | "SHAPE";
export type GLink = { source: string | GNode; target: string | GNode; type: LinkType };
export type LinkDef = { source: string; target: string; type: LinkType };
export type FG = ForceGraphMethods<NodeObject<GNode>, LinkObject<GNode, GLink>>;
export type GraphData = { nodes: GNode[]; links: GLink[] };

export interface Hl { path: WhyPath; nodes: Set<string>; segs: [string, string][]; t0: number }
export interface Slot { x: number; y: number; s: number; alpha: number; kind?: "past" | "now" | "next" }

export interface Scene {
  mode: "galaxy" | "conference";
  confId: string | null;
  byId: Map<string, GNode>; // current graph nodes by graph id
  hl: Hl | null;
  pulses: Map<string, number>; // graph id -> t0 of ring
  lit: Set<string>; // ids switched to "done" locally after a pulse
  replay: { from: number; to: number; cursor: number } | null;
  scope: "today" | "all";
  today: string;
  asterism: string[]; // plan itinerary ids in time order
  coverage: Map<string, number>; // goalId -> covered/planned (0..1), -1 if nothing planned
  fly: { conf: string; t0: number } | null;
  zoomK: number;
  reduced: boolean; lowPower: boolean;
  focusId: string | null;
  fonts: { sans: string; name: string };
  labelEls: Map<string, HTMLElement>; // galaxy label buttons keyed by confId
  slots: Map<string, Slot>;
  todayConf: string | null; // galaxy: conference whose ring twinkles
  backdrop: Float32Array; // x, y, size, alpha × N
  visible: (n: GNode) => boolean;
  getFg: () => FG | undefined;
}
