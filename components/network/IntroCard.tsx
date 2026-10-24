"use client";
import Link from "next/link";
import type { WarmIntro } from "@/lib/types";
import { Chip, WhyLine } from "@/components/ui";
import { PersonCard, personHref } from "@/components/people/PersonCard";

export { personHref };

/** Warm intro / met-before card. Shared by /network and /brief. */
export function IntroCard({ intro, confId, compact }: { intro: WarmIntro; confId: string; compact?: boolean }) {
  const warm = intro.kind === "warm_intro";
  return (
    <PersonCard
      person={intro.person}
      href
      compact={compact}
      chips={<Chip kind={warm ? "accent" : "status"}>{warm ? "Warm intro" : "Met before"}</Chip>}
    >
      {/* The intro text usually IS the path sentence: render it once, as the tappable WhyLine. */}
      {intro.path && intro.path.text.trim() === intro.text.trim() ? (
        <WhyLine paths={[intro.path]} confId={confId} className="text-sm leading-6 text-text" />
      ) : (
        <>
          <p className="text-sm leading-6 text-text">{intro.text}</p>
          {intro.path && <WhyLine paths={[intro.path]} confId={confId} className="mt-1" />}
        </>
      )}
      {intro.via && (
        <p className="mt-1 text-xs text-muted">
          via{" "}
          <Link href={personHref(intro.via.id)} className="text-text hover:underline underline-offset-2">{intro.via.name}</Link>
        </p>
      )}
    </PersonCard>
  );
}
