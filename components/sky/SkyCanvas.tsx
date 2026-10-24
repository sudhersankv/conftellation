"use client";
// The only runtime import of react-force-graph-2d; loaded via dynamic(..., { ssr: false }) in SkyStage.
import ForceGraph2D from "react-force-graph-2d";
import { useEffect, useState, type MutableRefObject } from "react";
import type { Painters } from "@/lib/ui/sky/paint";
import type { FG, GLink, GNode, GraphData } from "@/lib/ui/sky/types";

export interface SkyCanvasProps {
  fgRef: MutableRefObject<FG | undefined>;
  data: GraphData;
  mode: "galaxy" | "conference";
  painters: Painters;
  visible: (n: GNode) => boolean;
  onNodeClick: (n: GNode) => void;
  onBackgroundClick: () => void;
  onEngineStop: () => void;
  onReady: (fg: FG) => void;
}

// source/target are plain ids until force-graph resolves them
const ends = (visible: (n: GNode) => boolean, l: GLink) => [l.source, l.target].every((e) => typeof e !== "object" || visible(e));

export default function SkyCanvas(p: SkyCanvasProps) {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const { fgRef, onReady } = p;
  useEffect(() => { if (fgRef.current) onReady(fgRef.current); }, [fgRef, onReady]);
  const gal = p.mode === "galaxy";
  return (
    <ForceGraph2D
      ref={fgRef as MutableRefObject<never>}
      width={size.w}
      height={size.h}
      graphData={p.data}
      backgroundColor="rgba(0,0,0,0)"
      autoPauseRedraw={false}
      nodeId="id"
      nodeCanvasObjectMode={() => "replace"}
      nodeCanvasObject={p.painters.paintNode}
      nodePointerAreaPaint={p.painters.paintHit}
      linkCanvasObjectMode={() => "replace"}
      linkCanvasObject={p.painters.paintLink}
      nodeVisibility={(n) => p.visible(n as GNode)}
      linkVisibility={(l) => ends(p.visible, l as GLink)}
      onRenderFramePre={p.painters.paintPre}
      onRenderFramePost={p.painters.paintPost}
      onNodeClick={(n) => p.onNodeClick(n as GNode)}
      onBackgroundClick={p.onBackgroundClick}
      onEngineStop={p.onEngineStop}
      enableNodeDrag={false}
      warmupTicks={gal ? 0 : 60}
      cooldownTicks={gal ? 0 : 120}
      minZoom={gal ? 0.1 : 0.3}
      maxZoom={8}
    />
  );
}
