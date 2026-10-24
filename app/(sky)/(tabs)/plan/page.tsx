"use client";
import { Sheet } from "@/components/ui/Sheet";
import { Chip } from "@/components/ui/Chip";
import { WhyLine } from "@/components/ui/WhyLine";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { api } from "@/lib/client";
import { fmtRange } from "@/lib/ui/format";
import { useSession } from "@/lib/ui/session-context";
import { apiKey, useApi } from "@/lib/ui/use-api";

export default function PlanPage() {
  const { userId, confId, nowIso } = useSession();
  const now = nowIso();
  const { data, error, loading, reload } = useApi(apiKey("plan", userId, confId, now), () => api.plan(userId, confId, { now }));
  return (
    <Sheet>
      {loading ? <Skeleton rows={4} />
        : error && !data ? <ErrorState what="your plan" onRetry={reload} />
        : !data || data.itinerary.length === 0 ? <EmptyState text="No plan yet. Set your goals to build one." />
        : (
          <ul className="flex flex-col gap-3">
            {data.itinerary.map(({ from, to, item }, i) => (
              <li key={`${item.id}-${i}`} className="rounded-card border border-hairline bg-ink p-4">
                <Chip kind="time">{fmtRange(from, to)}</Chip>
                <p className="mt-2 text-title">{item.title}</p>
                {item.subtitle && <p className="text-meta text-dust">{item.subtitle}</p>}
                <WhyLine paths={item.why} />
              </li>
            ))}
          </ul>
        )}
    </Sheet>
  );
}
