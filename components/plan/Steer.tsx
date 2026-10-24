"use client";
import { useState } from "react";
import { ArrowRight, Check, CornerDownLeft, Sparkles, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import type { PlanResponse, SteerResponse } from "@/lib/types";
import { api } from "@/lib/client";
import { fmtTime } from "@/lib/ui/format";
import { useSession } from "@/lib/ui/session-context";
import { Button, Chip, Input } from "@/components/ui";
import { cn } from "@/lib/ui/cn";
import { opLabel } from "./time";

/** Sticky steer input. Parent owns the proposal (so it renders above the grid). */
export function SteerBar({ onPlan, onProposal }: { onPlan(p: PlanResponse): void; onProposal(r: SteerResponse | null): void }) {
  const { userId, confId } = useSession();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const submit = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true); setHint(null);
    try {
      const res = await api.steer(userId, confId, t);
      if (res.ops.length === 0) { setHint(res.summary || "Didn't catch that. Try “leaving at 3pm”."); return; }
      onPlan(res.plan);
      onProposal(res);
      setText("");
      const undo = res.undo;
      toast(res.summary, undo?.length ? { action: { label: "Undo", onClick: () => void undoSteer(userId, confId, undo, onPlan, () => onProposal(null)) } } : undefined);
    } catch (e) {
      setHint(e instanceof Error ? `Steer failed: ${e.message}` : "Steer failed.");
    } finally { setBusy(false); }
  };
  return (
    <div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div className="relative min-w-0 flex-1">
          <Sparkles className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Steer your day… e.g. leaving at 3pm, more tracing, less hiring" aria-label="Steer your day" className="pl-9 pr-9" disabled={busy} />
          <CornerDownLeft className="pointer-events-none absolute right-3 top-1/2 hidden size-3.5 -translate-y-1/2 text-faint md:block" aria-hidden />
        </div>
        <Button type="submit" loading={busy} disabled={!text.trim()}>Steer</Button>
      </form>
      {busy && <p className="mt-1.5 text-xs text-muted">Planner is re-routing your day…</p>}
      {hint && !busy && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

async function undoSteer(userId: string, confId: string, undo: NonNullable<SteerResponse["undo"]>, onPlan: (p: PlanResponse) => void, done: () => void) {
  try {
    const r = await api.steer(userId, confId, "undo", undo);
    onPlan(r.plan);
    done();
    toast("Reverted");
  } catch (e) {
    toast.error("Couldn't undo", { description: e instanceof Error ? e.message : undefined });
  }
}

/** Inline card confirming an applied steer: summary, op chips, diff, Keep / Undo. */
export function ProposalPanel({ res, tz, onPlan, onClose }: { res: SteerResponse; tz: string; onPlan(p: PlanResponse): void; onClose(): void }) {
  const { userId, confId } = useSession();
  const [busy, setBusy] = useState(false);
  const { added, removed, moved } = res.diff;
  const none = added.length + removed.length + moved.length === 0;
  const Row = ({ sign, dot, title, extra }: { sign: string; dot: string; title: string; extra?: React.ReactNode }) => (
    <li className="flex min-w-0 items-center gap-2 py-1 text-sm">
      <span className={cn("size-1.5 shrink-0 rounded-full", dot)} aria-hidden />
      <span className="tabular w-3 shrink-0 text-center text-muted">{sign}</span>
      <span className="min-w-0 truncate text-text">{title}</span>
      {extra}
    </li>
  );
  const t = (iso: string) => (/T/.test(iso) ? fmtTime(iso, tz) : iso);
  return (
    <div className="animate-fadeIn rounded-lg border border-border bg-surface p-4" role="status">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted">
            <Check className="size-3.5 text-[#0B7A52]" aria-hidden />Applied · Planner re-routed your day
          </div>
          <p className="mt-1 text-sm font-medium leading-6 text-text">{res.summary}</p>
        </div>
        <button type="button" onClick={onClose} className="-mr-2 -mt-2 grid size-10 shrink-0 place-items-center rounded-md text-muted hover:bg-surface2 hover:text-text" aria-label="Dismiss">
          <X className="size-4" />
        </button>
      </div>
      {res.ops.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {res.ops.map((op, i) => <Chip key={i} kind="accent" className="font-mono text-[11px]">{op.op} → {opLabel(op, tz)}</Chip>)}
        </div>
      )}
      <ul className={cn("mt-3 border-t border-border pt-2", none && "hidden")}>
        {added.map((a) => <Row key={`a${a.id}`} sign="+" dot="bg-ok" title={a.title} />)}
        {removed.map((a) => <Row key={`r${a.id}`} sign="−" dot="bg-danger" title={a.title} />)}
        {moved.map((a) => (
          <Row key={`m${a.id}`} sign="↔" dot="bg-muted" title={a.title} extra={
            <span className="tabular ml-auto flex shrink-0 items-center gap-1 text-xs text-muted">{t(a.from)}<ArrowRight className="size-3" aria-hidden />{t(a.to)}</span>
          } />
        ))}
      </ul>
      {none && <p className="mt-2 text-xs text-muted">No sessions changed.</p>}
      <div className="mt-3 flex gap-2">
        <Button size="sm" className="h-10 md:h-8" onClick={onClose}><Check className="size-3.5" aria-hidden />Keep</Button>
        {res.undo && res.undo.length > 0 && (
          <Button variant="secondary" size="sm" className="h-10 md:h-8" loading={busy} onClick={async () => { setBusy(true); await undoSteer(userId, confId, res.undo!, onPlan, onClose); setBusy(false); }}>
            {!busy && <Undo2 className="size-3.5" aria-hidden />}Undo
          </Button>
        )}
      </div>
    </div>
  );
}
