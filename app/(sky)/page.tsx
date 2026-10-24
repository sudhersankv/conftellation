"use client";
// Galaxy home: the canvas draws the constellations; this page floats the title, avatar and add pill over it.
import { useEffect } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Avatar } from "@/components/shell/TopBar";
import { buttonClass } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/States";
import { useSession } from "@/lib/ui/session-context";
import { useSky } from "@/lib/ui/sky-store";
import { useGalaxy } from "@/lib/ui/sky/use-galaxy";

export default function GalaxyPage() {
  const { userId } = useSession();
  const g = useGalaxy();
  useEffect(() => {
    const s = useSky.getState();
    s.setCovered(false);
    if (s.mode !== "galaxy") s.setMode("galaxy");
  }, []);
  return (
    <main className="pointer-events-none fixed inset-0 z-10 flex flex-col px-4 pt-[max(16px,env(safe-area-inset-top))]">
      <header className="flex items-start justify-between">
        <h1 className="font-display text-display">Your conferences</h1>
        <Link href="/me" aria-label="My record" className="pointer-events-auto grid size-12 place-items-center">
          <Avatar userId={userId} />
        </Link>
      </header>
      {g.error && !g.data && <div className="pointer-events-auto mt-6 rounded-card bg-ink/72 backdrop-blur-xl"><ErrorState what="your conferences" onRetry={g.reload} /></div>}
      {g.data && g.data.record.conferences.length === 0 && (
        <p className="mt-auto mb-28 text-center text-body text-dust">Add a conference to start your sky</p>
      )}
      <Link
        href="/add"
        className={buttonClass({ className: "pointer-events-auto fixed bottom-[calc(24px+env(safe-area-inset-bottom))] right-4 shadow-lg" })}
      >
        <Plus className="size-4" aria-hidden />Add conference
      </Link>
    </main>
  );
}
