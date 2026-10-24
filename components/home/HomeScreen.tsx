"use client";
import { LogoMark } from "@/components/shell/Logo";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, CalendarPlus } from "lucide-react";
import { api } from "@/lib/client";
import { useApi, apiKey } from "@/lib/ui/use-api";
import { useSession, userName } from "@/lib/ui/session-context";
import { buttonClass, EmptyState, ErrorState, PageHeader, SectionHeader, Skeleton } from "@/components/ui";
import { ConferenceCard } from "@/components/record/ConferenceCard";

const firstName = (n: string) => n.split(/\s+/)[0];

export function HomeScreen() {
  const router = useRouter();
  const { userId, confId, setConfId } = useSession();
  const rec = useApi(apiKey("record", userId), () => api.record(userId));
  const raw = rec.data?.user.name;
  const name = firstName(raw && raw !== userId ? raw : userName(userId));
  const confs = rec.data?.conferences ?? [];

  const open = (id: string) => { setConfId(id); router.push("/plan"); };

  return (
    <div>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-x-3"><LogoMark size={40} className="shadow-hard" />{`${name}'s conferences`}<span className="-rotate-3 font-hand text-2xl font-semibold text-[#C2185B] md:text-3xl">your conference brain</span></span>}
        subtitle="Pick one to open its plan, or pull a new agenda."
        actions={rec.data && confs.length === 0 ? undefined : <Link href="/add" className={buttonClass()}><Plus className="size-4" />Add a conference</Link>}
      />
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
