"use client";
import { useEffect } from "react";
import { SkyControls } from "@/components/sky/SkyControls";
import { StarCard } from "@/components/sky/StarCard";
import { StarList } from "@/components/sky/StarList";
import { useSky } from "@/lib/ui/sky-store";

// The canvas is mounted by the layout; this page only floats controls over it.
export default function SkyPage() {
  useEffect(() => { useSky.getState().setCovered(false); }, []);
  return (
    <div className="pointer-events-none fixed inset-0 z-10">
      <h1 className="sr-only">Sky</h1>
      <SkyControls />
      <StarList />
      <StarCard />
    </div>
  );
}
