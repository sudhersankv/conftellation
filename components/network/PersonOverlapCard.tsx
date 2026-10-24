"use client";
import { Handshake } from "lucide-react";
import type { NetworkUser, OpenTo } from "@/lib/types";
import { Button, Chip } from "@/components/ui";
import { fmtRange } from "@/lib/ui/format";
import { TYPE_COLOR } from "@/lib/ui/tokens";
import { PersonCard } from "@/components/people/PersonCard";

export const OPEN_TO_LABEL: Record<OpenTo, string> = { hiring: "Hiring", job_hunting: "Job hunting", buying: "Buying", learning: "Learning" };

/** An attendee whose plan overlaps yours. */
export function PersonOverlapCard({ nu, onRequest, pending }: { nu: NetworkUser; onRequest(): void; pending?: boolean }) {
  const { user } = nu;
  return (
    <PersonCard
      person={{ id: user.personId ?? user.id, name: user.name, userId: user.id }}
      href={!!user.personId}
      color={TYPE_COLOR.user}
      meta={<span className="tabular">{nu.overlap} in common</span>}
      chips={user.openTo.length > 0 ? user.openTo.map((o) => <Chip key={o} kind="status">Open to {OPEN_TO_LABEL[o]?.toLowerCase() ?? o}</Chip>) : undefined}
      actions={
        <Button size="sm" variant={pending ? "secondary" : "primary"} onClick={onRequest}>
          <Handshake className="size-3.5" aria-hidden />{pending ? "Request sent · Send another" : "Request meet"}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {nu.shared.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs text-faint">Both planned</p>
            <div className="flex flex-wrap gap-1.5">
              {nu.shared.map((s) => (
                <Chip key={s.id} kind={s.type === "booth" ? "booth" : "topic"} dot={TYPE_COLOR[s.type]} className="max-w-full">
                  <span className="truncate">{s.title}</span>
                </Chip>
              ))}
            </div>
          </div>
        )}

        {nu.sharedTopics.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {nu.sharedTopics.map((t) => <Chip key={t} kind="topic" dot={TYPE_COLOR.topic}>{t}</Chip>)}
          </div>
        )}

        {nu.freeSlots.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs text-faint">Both free</p>
            <div className="flex flex-wrap gap-1.5">
              {nu.freeSlots.slice(0, 4).map((s) => <Chip key={s.from} kind="time">{fmtRange(s.from, s.to)}</Chip>)}
            </div>
          </div>
        )}
      </div>
    </PersonCard>
  );
}
