"use client";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/shell/TopBar";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { useSession, userName } from "@/lib/ui/session-context";
import { useSky } from "@/lib/ui/sky-store";

const first = (id: string) => userName(id).split(" ")[0];

export default function MePage() {
  const { userId, otherUserId, setUserId } = useSession();
  const switchUser = () => {
    useSky.getState().clearHighlight();
    setUserId(otherUserId);
    toast(`Viewing as ${first(otherUserId)}`);
  };
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-30 flex h-[calc(env(safe-area-inset-top)+56px)] items-end px-4 pb-1 pt-[env(safe-area-inset-top)]">
        <Link href="/plan" className="flex min-h-12 items-center gap-1 text-meta text-dust hover:text-star">
          <ChevronLeft className="size-4" aria-hidden />
          Back
        </Link>
      </header>
      <Sheet title="My record" className="bottom-0 top-[calc(env(safe-area-inset-top)+56px)] md:bottom-4">
        <section aria-label="Demo user" className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Avatar userId={userId} size={48} />
          <p className="text-body">Viewing as <span className="font-semibold">{first(userId)}</span></p>
          <span className="text-dust" aria-hidden>·</span>
          <Button variant="ghost" onClick={switchUser}>Switch to {first(otherUserId)}</Button>
        </section>
        {/* record cards go below the switcher */}
      </Sheet>
    </>
  );
}
