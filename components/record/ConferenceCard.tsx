"use client";
// One conference ticket: name, dates, city, counts. Pass `rec` (personal record: sessions/people/moments, brief/trip chips; Home + Me)
// or `summary` (catalogue: sessions/people/companies, "N attending", Live badge; Conferences). `actions` renders in the footer.
import type { ReactNode } from "react";
import { CalendarDays, MapPin } from "lucide-react";
import type { ConferenceSummary, RecordConference } from "@/lib/types";
import { Card, Chip, CollectedAgo } from "@/components/ui";
import { TYPE_COLOR } from "@/lib/ui/tokens";
import { cn } from "@/lib/ui/cn";
import { fmtConfDates } from "./conf-format";

function Stat({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <div className="rounded-lg border-2 border-border px-2.5 py-1.5" style={{ background: color }}>
      <div className="tabular font-heading text-xl font-bold leading-6 text-ink">{n.toLocaleString("en-US")}</div>
      <div className="text-[11px] font-medium leading-4 text-ink">{label}</div>
    </div>
  );
}

type Props = { active?: boolean; onOpen?: () => void; actions?: ReactNode } & ({ rec: RecordConference; summary?: never } | { summary: ConferenceSummary; rec?: never });

export function ConferenceCard({ rec, summary, active, onOpen, actions }: Props) {
  const c = (rec ?? summary)!.conference;
  const live = summary?.status === "live";
  const past = summary?.status === "past";
  const stats = rec
    ? [{ n: rec.sessions, label: rec.sessions === 1 ? "session" : "sessions", color: TYPE_COLOR.session }, { n: rec.people, label: rec.people === 1 ? "person" : "people", color: TYPE_COLOR.person }, { n: rec.moments, label: rec.moments === 1 ? "moment" : "moments", color: "#FF6FAE" }]
    : [{ n: summary!.counts.sessions, label: summary!.counts.sessions === 1 ? "session" : "sessions", color: TYPE_COLOR.session }, { n: summary!.counts.people, label: summary!.counts.people === 1 ? "person" : "people", color: TYPE_COLOR.person }, { n: summary!.counts.companies, label: summary!.counts.companies === 1 ? "company" : "companies", color: TYPE_COLOR.company }];
  const band = active ? "#FFD23F" : live ? "#FF6FAE" : past ? TYPE_COLOR.conference : "#4DA3FF";
  return (
    <Card
      interactive={!!onOpen}
      onClick={onOpen}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={onOpen ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } } : undefined}
      className={cn("flex flex-col gap-3 p-0 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent")}
    >
      <div className="flex h-9 items-center justify-between border-b-2 border-dashed border-border px-4" style={{ background: band }}>
        <span className="font-heading text-[11px] font-bold uppercase tracking-widest text-ink">{live ? "Live now" : past ? "Past" : "Admit one"}</span>
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
        {active ? <Chip kind="accent" className="shrink-0">Current</Chip> : live ? <Chip kind="accent" className="shrink-0 bg-pink">Live now</Chip> : summary?.attending ? <Chip kind="status" className="shrink-0">Attending</Chip> : null}
      </div>
      <div className="grid grid-cols-3 gap-2 px-4">
        {stats.map((st) => <Stat key={st.label} n={st.n} label={st.label} color={st.color} />)}
      </div>
      {summary && (
        <p className="px-4 text-xs text-muted"><span className="font-heading font-bold text-text">{summary.attendees.toLocaleString("en-US")}</span> {past ? "attended" : "attending"}</p>
      )}
      {rec && (rec.hasBrief || rec.hasTrip) && (
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
