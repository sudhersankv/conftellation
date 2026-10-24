"use client";
// One conference from the personal record: name, dates, city, counts, brief/trip chips. Used on Home (whole card clickable) and Me (with actions).
import type { ReactNode } from "react";
import { CalendarDays, MapPin } from "lucide-react";
import type { RecordConference } from "@/lib/types";
import { Card, Chip, CollectedAgo } from "@/components/ui";
import { TYPE_COLOR } from "@/lib/ui/tokens";
import { cn } from "@/lib/ui/cn";
import { fmtConfDates, plural } from "./conf-format";

function Stat({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <div className="rounded-lg border-2 border-border px-2.5 py-1.5" style={{ background: color }}>
      <div className="tabular font-heading text-xl font-bold leading-6 text-ink">{n}</div>
      <div className="text-[11px] font-medium leading-4 text-ink">{label}</div>
    </div>
  );
}

export function ConferenceCard({ rec, active, onOpen, actions }: { rec: RecordConference; active?: boolean; onOpen?: () => void; actions?: ReactNode }) {
  const c = rec.conference;
  return (
    <Card
      interactive={!!onOpen}
      onClick={onOpen}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={onOpen ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } } : undefined}
      className={cn("flex flex-col gap-3 p-0 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent")}
    >
      <div className="flex h-9 items-center justify-between border-b-2 border-dashed border-border px-4" style={{ background: active ? "#FFD23F" : "#4DA3FF" }}>
        <span className="font-heading text-[11px] font-bold uppercase tracking-widest text-ink">Admit one</span>
        <span className="flex gap-1" aria-hidden>{[0, 1, 2].map((i) => <span key={i} className="size-2 rounded-full border-2 border-border bg-surface" />)}</span>
      </div>
      <div className="flex items-start justify-between gap-3 px-4">
        <div className="min-w-0">
          <h3 className="truncate font-heading text-xl font-bold tracking-tight text-text">{c.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" aria-hidden />{fmtConfDates(c)}</span>
            {c.city && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden />{c.city}</span>}
          </div>
        </div>
        {active && <Chip kind="accent" className="shrink-0">Current</Chip>}
      </div>
      <div className="grid grid-cols-3 gap-2 px-4">
        <Stat n={rec.sessions} label={rec.sessions === 1 ? "session" : "sessions"} color={TYPE_COLOR.session} />
        <Stat n={rec.people} label={rec.people === 1 ? "person" : "people"} color={TYPE_COLOR.person} />
        <Stat n={rec.moments} label={rec.moments === 1 ? "moment" : "moments"} color="#FF6FAE" />
      </div>
      {(rec.hasBrief || rec.hasTrip) && (
        <div className="flex flex-wrap items-center gap-1.5 px-4">
          {rec.hasBrief && <Chip kind="status">Brief ready</Chip>}
          {rec.hasTrip && <Chip kind="status">Trip report</Chip>}
        </div>
      )}
      {(actions || c.collectedAt) && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-4">
          <CollectedAgo at={c.collectedAt} source={c.source ?? c.url} />
          {actions && <div className="grid w-full grid-cols-3 gap-2 sm:ml-auto sm:flex sm:w-auto sm:flex-wrap sm:items-center" onClick={(e) => e.stopPropagation()}>{actions}</div>}
        </div>
      )}
    </Card>
  );
}
