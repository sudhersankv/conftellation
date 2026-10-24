"use client";
import { useEffect } from "react";
import { useSky } from "@/lib/ui/sky-store";

export default function SkyPage() {
  useEffect(() => { useSky.getState().setCovered(false); }, []);
  return <h1 className="sr-only">Sky</h1>;
}
