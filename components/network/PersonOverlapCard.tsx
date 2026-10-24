"use client";
import Link from "next/link";
import { Handshake } from "lucide-react";
import type { NetworkUser, OpenTo } from "@/lib/types";
import { Avatar, Button, Card, Chip } from "@/components/ui";
import { fmtRange } from "@/lib/ui/format";
import { TYPE_COLOR } from "@/lib/ui/tokens";
import { personHref } from "./IntroCard";

export const OPEN_TO_LABEL: Record<OpenTo, string> = { hiring: "Hiring", job_hunting: "Job hunting", buying: "Buying", learning: "Learning" };

/** An attendee whose plan overlaps yours. */
export function PersonOverlapCard({ nu, onRequest, pending }: { nu: NetworkUser; onRequest(): void; pending?: boolean }) {
  const { user } = nu;
  const name = (
    <span className="text-sm font-semibold text-text">{user.name}</span>
  );
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <Avatar name={user.name} color={TYPE_COLOR.user} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {user.personId ? <Link href={personHref(user.personId)} className="hover:underline underline-offset-2">{name}</Link> : name}
            <span className="text-xs text-muted tabular">{nu.overlap} in common</span>
          </div>
          {user.openTo.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {user.openTo.map((o) => <Chip key={o} kind="status">Open to {OPEN_TO_LABEL[o]?.toLowerCase() ?? o}</Chip>)}
            </div>
          )}
        </div>
      </div>

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

      <div className="flex justify-end">
        <Button size="sm" variant={pending ? "secondary" : "primary"} onClick={onRequest}>
          <Handshake className="size-3.5" aria-hidden />{pending ? "Request sent · Send another" : "Request meet"}
        </Button>
      </div>
    </Card>
  );
}
