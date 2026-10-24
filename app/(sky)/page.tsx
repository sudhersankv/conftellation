"use client";
// Galaxy placeholder: the live galaxy replaces the body.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/shell/TopBar";
import { buttonClass } from "@/components/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { api } from "@/lib/client";
import { fmtDay } from "@/lib/ui/format";
import { useSession } from "@/lib/ui/session-context";
import { useSky } from "@/lib/ui/sky-store";
import { apiKey, useApi } from "@/lib/ui/use-api";

export default function GalaxyPage() {
  const { userId, setConfId } = useSession();
  const router = useRouter();
  const { data, error, loading, reload } = useApi(apiKey("record", userId), () => api.record(userId));
  return (
    <main className="mx-auto max-w-md px-4 pb-24 pt-[calc(env(safe-area-inset-top)+24px)]">
      <Link href="/me" aria-label="My record" className="absolute right-4 top-[calc(env(safe-area-inset-top)+8px)] grid size-12 place-items-center">
        <Avatar userId={userId} />
      </Link>
      <h1 className="font-display text-display">Your conferences</h1>
      <div className="mt-6">
        {loading ? <Skeleton rows={2} />
          : error && !data ? <ErrorState what="your conferences" onRetry={reload} />
          : !data || data.conferences.length === 0 ? (
            <EmptyState text="Add a conference to start your sky" action={<Link href="/add" className={buttonClass()}>Add conference</Link>} />
          ) : (
            <ul className="flex flex-col gap-3">
              {data.conferences.map(({ conference: c, sessions, people }) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="min-h-12 w-full rounded-card border border-hairline bg-ink p-4 text-left"
                    onClick={() => { setConfId(c.id); useSky.getState().setMode("conference", c.id); router.push("/plan"); }}
                  >
                    <span className="block font-name text-title font-normal italic">{c.name}</span>
                    <span className="block text-meta text-dust" suppressHydrationWarning>
                      {fmtDay(`${c.startDate.slice(0, 10)}T12:00:00Z`, "UTC")} · {sessions} sessions, {people} people
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
      </div>
      <Link href="/add" className={buttonClass({ className: "mt-6" })}>Add conference</Link>
    </main>
  );
}
