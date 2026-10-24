import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { NetworkView } from "@/components/network/NetworkView";

export default function NetworkPage() {
  return (
    <Suspense fallback={<Skeleton rows={4} rowClassName="h-24" />}>
      <NetworkView />
    </Suspense>
  );
}
