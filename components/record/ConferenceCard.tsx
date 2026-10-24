"use client";
// One conference from the personal record: name, dates, city, counts, brief/trip chips. Used on Home (whole card clickable) and Me (with actions).
import type { ReactNode } from "react";
import { CalendarDays, MapPin } from "lucide-react";
import type { RecordConference } from "@/lib/types";
import { Card, Chip, CollectedAgo } from "@/components/ui";
import { TYPE_COLOR } from "@/lib/ui/tokens";
import { cn } from "@/lib/ui/cn";
import { fmtConfDates, plural } from "./conf-format";

export function ConferenceCard({ rec, active, onOpen, actions }: { rec: RecordConference; active?: boolean; onOpen?: () => void; actions?: ReactNode }) {
  const c = rec.conference;
  return (
    <Card
      interactive={!!onOpen}
      onClick={onOpen}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={onOpen ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } } : undefined}
      className={cn("flex flex-col gap-3 focus-visible:border-accent focus-visible:outline-none", active && "border-accent/50")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold tracking-tight text-text">{c.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" aria-hidden />{fmtConfDates(c)}</span>
            {c.city && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden />{c.city}</span>}
          </div>
        </div>
        {active && <Chip kind="accent" className="shrink-0">Current</Chip>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip dot={TYPE_COLOR.session}>{plural(rec.sessions, "session")}</Chip>
        <Chip dot={TYPE_COLOR.person}>{plural(rec.people, "person", "people")}</Chip>
        <Chip dot={TYPE_COLOR.moment}>{plural(rec.moments, "moment")}</Chip>
        {rec.hasBrief && <Chip kind="status">Brief ready</Chip>}
        {rec.hasTrip && <Chip kind="status">Trip report</Chip>}
      </div>
      {(actions || c.collectedAt) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CollectedAgo at={c.collectedAt} source={c.source ?? c.url} />
          {actions && <div className="grid w-full grid-cols-3 gap-2 sm:ml-auto sm:flex sm:w-auto sm:flex-wrap sm:items-center" onClick={(e) => e.stopPropagation()}>{actions}</div>}
        </div>
      )}
    </Card>
  );
}
