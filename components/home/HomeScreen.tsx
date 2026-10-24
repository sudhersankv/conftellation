"use client";
import { LogoMark } from "@/components/shell/Logo";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, CalendarPlus, CalendarRange, ArrowRight } from "lucide-react";
import { api } from "@/lib/client";
import { useApi, apiKey } from "@/lib/ui/use-api";
import { useSession, userName } from "@/lib/ui/session-context";
import { buttonClass, EmptyState, ErrorState, PageHeader, SectionHeader, Skeleton } from "@/components/ui";
import { ConferenceCard } from "@/components/record/ConferenceCard";
import { fmtConfDates } from "@/components/record/conf-format";

const firstName = (n: string) => n.split(/\s+/)[0];

export function HomeScreen() {
  const router = useRouter();
  const { userId, confId, setConfId } = useSession();
  const rec = useApi(apiKey("record", userId), () => api.record(userId));
  const raw = rec.data?.user.name;
  const name = firstName(raw && raw !== userId ? raw : userName(userId));
  const confs = rec.data?.conferences ?? [];
  const cat = useApi(apiKey("conferences", userId), () => api.conferences(userId));
  // Teaser: the next upcoming (or live) conference, only when the user attends none of them.
  const ahead = cat.data ? [...cat.data.upcoming, ...cat.data.past].filter((c) => c.status !== "past") : [];
  const next = ahead.some((c) => c.attending) ? undefined : [...ahead].sort((a, b) => a.conference.startDate.localeCompare(b.conference.startDate))[0];

  const open = (id: string) => { setConfId(id); router.push("/plan"); };

  return (
    <div>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-x-3"><LogoMark size={40} className="shadow-hard" />{`${name}'s conferences`}<span className="-rotate-3 font-hand text-2xl font-semibold text-[#C2185B] md:text-3xl">your conference brain</span></span>}
        subtitle="Pick one to open its plan, or pull a new agenda."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/add" className={buttonClass({ variant: "secondary" })}><CalendarRange className="size-4" />Browse conferences</Link>
            {!(rec.data && confs.length === 0) && <Link href="/add" className={buttonClass()}><Plus className="size-4" />Add a conference</Link>}
          </div>
        }
      />
      {next && (
        <Link href="/add" className="mb-5 flex min-h-12 items-center gap-2 rounded-full border-2 border-border bg-surface px-4 py-2 text-sm shadow-hardSm transition duration-fast hover:bg-surface2">
          <span className="shrink-0 font-heading text-xs font-bold uppercase tracking-wide">{next.status === "live" ? "Live now" : "Next up"}</span>
          <span className="min-w-0 flex-1 truncate">{[next.conference.name, fmtConfDates(next.conference), next.conference.city, `${next.attendees} attending`].filter(Boolean).join(" · ")}</span>
          <ArrowRight className="size-4 shrink-0" aria-hidden />
        </Link>
      )}
      {!rec.data && !rec.error ? (
        <Skeleton rows={3} rowClassName="h-32" className="grid gap-3 md:grid-cols-2" />
      ) : rec.error && !rec.data ? (
        <ErrorState what="your conferences" detail={rec.error.message} onRetry={rec.reload} />
      ) : confs.length === 0 ? (
        <EmptyState
          icon={<CalendarPlus className="size-6" />}
          title="No conferences yet"
          text="Paste an agenda link and Scout pulls the sessions, speakers and booths."
          action={<Link href="/add" className={buttonClass()}><Plus className="size-4" />Add a conference</Link>}
        />
      ) : (
        <section>
          <SectionHeader title="Your conferences" count={confs.length} />
          <div className="grid gap-3 md:grid-cols-2">
            {confs.map((c) => (
              <ConferenceCard key={c.conference.id} rec={c} active={c.conference.id === confId} onOpen={() => open(c.conference.id)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
