import { Suspense } from "react";
import { GraphView } from "@/components/graph/GraphView";

export default function GraphPage() {
  return (
    <Suspense fallback={<div className="grid h-[60dvh] place-items-center text-xs text-muted">Drawing your graph</div>}>
      <GraphView />
    </Suspense>
  );
}
