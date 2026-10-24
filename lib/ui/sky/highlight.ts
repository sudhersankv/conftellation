import type { WhyPath } from "@/lib/types";
import type { Hl } from "./types";

/** Nodes + segments to trace. Falls back to consecutive present path nodes when an edge end is missing. */
export function toHl(path: WhyPath, present: (id: string) => boolean, t0: number): Hl {
  const nodes = new Set(path.nodes.map((n) => n.id));
  const whole = path.edges.length > 0 && path.edges.every((e) => present(e.from) && present(e.to));
  let segs: [string, string][];
  if (whole) segs = path.edges.map((e) => [e.from, e.to]);
  else {
    const seq = path.nodes.map((n) => n.id).filter(present);
    segs = seq.slice(1).map((id, i) => [seq[i], id] as [string, string]);
  }
  return { path, nodes, segs, t0 };
}
