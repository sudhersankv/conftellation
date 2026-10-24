"use client";
// /people/[id]: role, talks, why, met before, Request meet, Log that we met.
import Link from "next/link";
import { useState } from "react";
import { ChevronRight, GitBranch, Handshake, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { api, momentForm } from "@/lib/client";
import { apiKey, useApi } from "@/lib/ui/use-api";
import { useSession } from "@/lib/ui/session-context";
import { fmtDay, fmtRange } from "@/lib/ui/format";
import { graphHref, TYPE_COLOR } from "@/lib/ui/tokens";
import { PersonLinks } from "./PersonCard";
import { Avatar, Button, buttonClass, Chip, CollectedAgo, EmptyState, ErrorState, SectionHeader, Skeleton, WhyList } from "@/components/ui";

const OPEN_TO: Record<string, string> = { hiring: "Hiring", job_hunting: "Open to roles", buying: "Buying", learning: "Learning" };

export function PersonView({ personId }: { personId: string }) {
  const { userId, confId } = useSession();
  const { data, error, loading, reload } = useApi(apiKey("person", personId, confId, userId), () => api.person(personId, { confId, userId }));
  const [busy, setBusy] = useState(false);

  if (error && !data) return <ErrorState what="this person" detail={error.message} onRetry={reload} />;
  if (loading || !data) return <div className="flex flex-col gap-3"><Skeleton rows={1} rowClassName="h-20" /><Skeleton rows={3} /></div>;

  const { person: p, sessions, why, metBefore = [] } = data;
  const logMet = async () => {
    setBusy(true);
    try {
      const res = await api.createMoment(userId, momentForm({ confId, kind: "met", personId: p.id }));
      toast(`Logged · ${res.lit.length} ${res.lit.length === 1 ? "star" : "stars"} lit`);
      reload();
    } catch (e) {
      toast.error(`Couldn't log it: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex items-start gap-4">
        <Avatar name={p.name} src={p.photoUrl} size="xl" color={TYPE_COLOR.person} className="shadow-hardSm" />
        <div className="min-w-0 flex-1">
          <h1 className="break-words font-heading text-2xl font-bold tracking-tight md:text-3xl">{p.name}</h1>
          {(p.title || p.company) && <p className="mt-0.5 text-sm text-muted">{[p.title, p.company].filter(Boolean).join(" @ ")}</p>}
          <PersonLinks links={p.links} className="mt-2.5" />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {(p.openTo ?? []).map((o) => <Chip key={o} kind="accent">{OPEN_TO[o] ?? o}</Chip>)}
            <CollectedAgo at={p.collectedAt} source={p.source} className="ml-0.5" />
            <Link href={graphHref([p.id])} className="inline-flex items-center gap-1 text-xs text-muted hover:text-text"><GitBranch className="size-3" />Show in graph</Link>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {p.userId && p.userId !== userId && (
          <Link href={`/network?meet=${encodeURIComponent(p.userId)}`} className={buttonClass({ size: "md" })}><Handshake className="size-4" />Request meet</Link>
        )}
        <Button variant="secondary" loading={busy} onClick={logMet}><UserPlus className="size-4" />Log that we met</Button>
      </div>

      {p.bio && <p className="text-sm leading-6 text-muted">{p.bio}</p>}

      <section>
        <SectionHeader title="Why this person" />
        {why.length > 0 ? <WhyList paths={why} confId={confId} /> : <EmptyState text="No direct link to your goals yet." />}
      </section>

      <section>
        <SectionHeader title="Talks" count={sessions.length} />
        {sessions.length === 0 ? (
          <EmptyState text="No talks listed for this conference." />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link href={`/sessions/${encodeURIComponent(s.id)}`} className="flex items-center gap-3 px-3 py-3 hover:bg-surface2">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: TYPE_COLOR.session }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-text">{s.title}</span>
                    <span className="mt-0.5 block text-xs text-muted">{fmtDay(s.start)} · {fmtRange(s.start, s.end)}{s.room ? ` · ${s.room}` : ""}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionHeader title="Met before" count={metBefore.length} />
        {metBefore.length === 0 ? (
          <EmptyState text="You haven't met at an earlier conference." />
        ) : (
          <ul className="flex flex-col gap-2">
            {metBefore.map((m) => (
              <li key={`${m.conferenceId}-${m.at}`} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm">
                <span className="truncate text-text">{m.conferenceName}</span>
                <span className="tabular shrink-0 text-xs text-muted">{fmtDay(m.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
