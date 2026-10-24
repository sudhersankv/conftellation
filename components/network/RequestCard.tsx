"use client";
import { useState } from "react";
import { CalendarClock, Check, X } from "lucide-react";
import type { MeetRequest, MeetStatus } from "@/lib/types";
import { Avatar, Button, Card, Chip } from "@/components/ui";
import { ago } from "@/lib/ui/format";
import { TYPE_COLOR } from "@/lib/ui/tokens";
import { cn } from "@/lib/ui/cn";
import { proposalText, type SessionLookup } from "./proposal";

const STATUS: Record<MeetStatus, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "text-muted" },
  accepted: { label: "Accepted", cls: "border-border text-[#0B7A52]" },
  declined: { label: "Declined", cls: "border-border text-[#D7263D]" },
  countered: { label: "New time suggested", cls: "border-border text-[#7A5C00]" },
};

export function StatusChip({ status }: { status: MeetStatus }) {
  const s = STATUS[status] ?? STATUS.pending;
  return <Chip kind="status" className={s.cls}>{s.label}</Chip>;
}

/** Incoming (actionable) or outgoing (status) meet request. */
export function RequestCard({
  req, direction, lookup, onAccept, onDecline, onSuggest,
}: {
  req: MeetRequest;
  direction: "incoming" | "outgoing";
  lookup: SessionLookup;
  onAccept?: () => Promise<void>;
  onDecline?: () => Promise<void>;
  onSuggest?: () => void;
}) {
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const incoming = direction === "incoming";
  const name = incoming ? req.fromName : req.toName;
  const where = proposalText(req.proposal, lookup);
  const run = async (k: "accept" | "decline", f?: () => Promise<void>) => {
    if (!f) return;
    setBusy(k);
    try { await f(); } finally { setBusy(null); }
  };
  // Incoming pending: I answer. After a counter the other party answers: outgoing countered is mine to act on.
  const actionable = incoming ? req.status === "pending" : req.status === "countered";
  return (
    <Card className={cn(actionable && "border-accent/40")} accent={actionable ? TYPE_COLOR.user : undefined}>
      <div className="flex items-start gap-3">
        <Avatar name={name} color={TYPE_COLOR.user} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-text">
              <span className="font-semibold">{name}</span>
              <span className="text-muted">{incoming ? " wants to meet" : req.status === "countered" ? " suggested another time" : " · you asked to meet"}</span>
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-faint" suppressHydrationWarning>{ago(req.at)}</span>
              <StatusChip status={req.status} />
            </div>
          </div>
          {req.note && <p className="mt-1.5 text-sm leading-6 text-text">&ldquo;{req.note}&rdquo;</p>}
          {where && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
              <CalendarClock className="size-3.5 shrink-0" aria-hidden />
              <span>at <span className="text-text">{where}</span></span>
            </p>
          )}
          {actionable && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => run("accept", onAccept)} loading={busy === "accept"} disabled={!!busy}>
                <Check className="size-3.5" aria-hidden />Accept
              </Button>
              <Button size="sm" variant="secondary" onClick={() => run("decline", onDecline)} loading={busy === "decline"} disabled={!!busy}>
                <X className="size-3.5" aria-hidden />Decline
              </Button>
              <Button size="sm" variant="ghost" onClick={onSuggest} disabled={!!busy}>Suggest another</Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
