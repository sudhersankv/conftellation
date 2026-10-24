"use client";
import Link from "next/link";
import type { WarmIntro } from "@/lib/types";
import { Avatar, Card, Chip, WhyLine } from "@/components/ui";
import { TYPE_COLOR } from "@/lib/ui/tokens";

export const personHref = (id: string) => `/people/${encodeURIComponent(id)}`;

/** Warm intro / met-before card. Shared by /network and /brief. */
export function IntroCard({ intro, confId, compact }: { intro: WarmIntro; confId: string; compact?: boolean }) {
  const warm = intro.kind === "warm_intro";
  return (
    <Card className={compact ? "p-3" : undefined}>
      <div className="flex items-start gap-3">
        <Avatar name={intro.person.name} size={compact ? "sm" : "md"} color={TYPE_COLOR.person} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={personHref(intro.person.id)} className="text-sm font-semibold text-text hover:underline underline-offset-2">
              {intro.person.name}
            </Link>
            <Chip kind={warm ? "accent" : "status"}>{warm ? "Warm intro" : "Met before"}</Chip>
          </div>
          {(intro.person.title || intro.person.company) && (
            <p className="mt-0.5 text-xs text-muted">{[intro.person.title, intro.person.company].filter(Boolean).join(" · ")}</p>
          )}
          {/* The intro text usually IS the path sentence: render it once, as the tappable WhyLine. */}
          {intro.path && intro.path.text.trim() === intro.text.trim() ? (
            <WhyLine paths={[intro.path]} confId={confId} className="mt-1.5 text-sm leading-6 text-text" />
          ) : (
            <>
              <p className="mt-2 text-sm leading-6 text-text">{intro.text}</p>
              {intro.path && <WhyLine paths={[intro.path]} confId={confId} className="mt-1" />}
            </>
          )}
          {intro.via && (
            <p className="mt-1 text-xs text-muted">
              via{" "}
              <Link href={personHref(intro.via.id)} className="text-text hover:underline underline-offset-2">{intro.via.name}</Link>
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
