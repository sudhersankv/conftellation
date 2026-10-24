"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, CalendarPlus, FileText, GitBranch, Plus, Target } from "lucide-react";
import type { OpenTo } from "@/lib/types";
import { api } from "@/lib/client";
import { useApi, apiKey } from "@/lib/ui/use-api";
import { useSession, userName } from "@/lib/ui/session-context";
import { Avatar, Button, Chip, EmptyState, ErrorState, SectionHeader, Skeleton, buttonClass } from "@/components/ui";
import { ConferenceCard } from "./ConferenceCard";
import { plural } from "./conf-format";

const OPEN_LABEL: Record<OpenTo, string> = { hiring: "Hiring", job_hunting: "Job hunting", buying: "Buying", learning: "Learning" };

export function MeScreen() {
  const router = useRouter();
  const { userId, confId, setConfId } = useSession();
  const rec = useApi(apiKey("record", userId), () => api.record(userId));
  const go = (id: string, href: string) => { setConfId(id); router.push(href); };

  if (!rec.data && !rec.error) return <div><Skeleton rows={1} rowClassName="h-16" className="mb-6" /><Skeleton rows={2} rowClassName="h-36" /></div>;
  if (rec.error && !rec.data) return <ErrorState what="your record" detail={rec.error.message} onRetry={rec.reload} />;

  const user = rec.data!.user;
  const confs = rec.data!.conferences;
  const name = user.name || userName(userId);
  const totals = confs.reduce((t, c) => ({ s: t.s + c.sessions, p: t.p + c.people, m: t.m + c.moments }), { s: 0, p: 0, m: 0 });

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-4">
        <Avatar name={name} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{name}</h1>
          <p className="mt-0.5 text-sm text-muted">
            {confs.length ? `${plural(confs.length, "conference")} · ${plural(totals.s, "session")} · ${plural(totals.p, "person", "people")} · ${plural(totals.m, "moment")}` : "No conferences yet"}
          </p>
          {user.openTo?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="self-center text-xs text-faint">Open to</span>
              {user.openTo.map((o) => <Chip key={o} kind="status" className="whitespace-nowrap">{OPEN_LABEL[o] ?? o}</Chip>)}
            </div>
          )}
        </div>
        </div>
        {confs.length > 0 && (
          <Link href="/graph?all=1" className={buttonClass({ variant: "secondary", className: "w-full sm:w-auto" })}><GitBranch className="size-4" />All conferences graph</Link>
        )}
      </div>

      {confs.length === 0 ? (
        <EmptyState
          icon={<CalendarPlus className="size-6" />}
          title="Your record is empty"
          text="Add a conference and set goals. Sessions, people and notes collect here."
          action={<Link href="/add" className={buttonClass()}><Plus className="size-4" />Add a conference</Link>}
        />
      ) : (
        <section>
          <SectionHeader
            title="Conferences"
            count={confs.length}
          />
          <div className="flex flex-col gap-3">
            {confs.map((r) => (
              <ConferenceCard
                key={r.conference.id}
                rec={r}
                active={r.conference.id === confId}
                actions={
                  <>
                    <Button size="sm" variant="secondary" className="h-10 md:h-8" onClick={() => go(r.conference.id, "/plan")}><CalendarDays className="size-3.5" />Plan</Button>
                    <Button size="sm" variant="secondary" className="h-10 md:h-8" onClick={() => go(r.conference.id, "/brief")}><FileText className="size-3.5" />Brief</Button>
                    <Button size="sm" variant="secondary" className="h-10 md:h-8" onClick={() => go(r.conference.id, "/graph")}><GitBranch className="size-3.5" />Graph</Button>
                    <Button size="sm" variant="ghost" className="hidden h-10 sm:inline-flex md:h-8" onClick={() => go(r.conference.id, "/goals")} aria-label="Edit goals"><Target className="size-3.5" />Goals</Button>
                  </>
                }
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
