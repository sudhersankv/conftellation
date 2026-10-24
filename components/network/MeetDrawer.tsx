"use client";
import { useEffect, useMemo, useState } from "react";
import type { MeetProposal, NetworkUser } from "@/lib/types";
import { Button, Drawer, Input, Label, Segmented, Textarea } from "@/components/ui";
import { fmtDay, fmtRange } from "@/lib/ui/format";
import { cn } from "@/lib/ui/cn";

type Mode = "session" | "slot" | "place";

const SELECT = "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text hover:border-borderStrong focus:border-accent focus:outline-none";

/**
 * Request a meet (note + proposal) or suggest another time for an incoming one (proposal only).
 * `target` supplies shared sessions and free slots when known.
 */
export function MeetDrawer({
  open, onOpenChange, name, target, counter, onSubmit, sessionEnd,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  name: string;
  target?: NetworkUser;
  counter?: boolean;
  onSubmit(v: { note: string; proposal: MeetProposal }): Promise<void>;
  /** Session end time lookup: sessions that already ended cannot be proposed (server rejects past slots). */
  sessionEnd?: (id: string) => string | undefined;
}) {
  const sessions = useMemo(() => {
    const now = Date.now();
    return (target?.shared ?? []).filter((s) => {
      if (s.type !== "session") return false;
      const end = sessionEnd?.(s.id);
      return !end || Date.parse(end) > now;
    });
    // recompute when the drawer opens so "now" is fresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, sessionEnd, open]);
  const slots = target?.freeSlots ?? [];
  const defaultMode: Mode = sessions.length ? "session" : slots.length ? "slot" : "place";

  const [mode, setMode] = useState<Mode>(defaultMode);
  const [note, setNote] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [slotIdx, setSlotIdx] = useState(0);
  const [place, setPlace] = useState("Expo Hall");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(defaultMode);
    setSessionId(sessions[0]?.id ?? "");
    setSlotIdx(0);
    setPlace("Expo Hall");
    setNote(sessions[0] ? `Catch up after ${sessions[0].title}?` : "Quick coffee?");
    // reset only when opening for a (new) person
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target?.user.id]);

  // Session end times can arrive after the drawer opened: drop a session that turned out to be over.
  useEffect(() => {
    if (!open || mode !== "session" || sessions.some((s) => s.id === sessionId)) return;
    if (sessions[0]) { setSessionId(sessions[0].id); return; }
    setMode(slots.length ? "slot" : "place");
    setNote((n) => (n.startsWith("Catch up after ") ? "Quick coffee?" : n));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, open]);

  useEffect(() => {
    if (!open || counter) return;
    if (mode === "session") {
      const s = sessions.find((x) => x.id === sessionId);
      if (s) setNote((n) => (n.startsWith("Catch up after ") || n === "Quick coffee?" ? `Catch up after ${s.title}?` : n));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const options: { value: Mode; label: string }[] = [
    ...(sessions.length ? [{ value: "session" as const, label: "Shared session" }] : []),
    ...(slots.length ? [{ value: "slot" as const, label: "Free slot" }] : []),
    { value: "place", label: "Place" },
  ];

  const proposal: MeetProposal | null =
    mode === "session" ? (sessionId ? { sessionId } : null)
    : mode === "slot" ? (slots[slotIdx] ? { slot: slots[slotIdx] } : null)
    : place.trim() ? { place: place.trim() } : null;

  const submit = async () => {
    if (!proposal) return;
    setBusy(true);
    try { await onSubmit({ note: note.trim(), proposal }); } finally { setBusy(false); }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={counter ? `Suggest another time to ${name}` : `Meet ${name}`}
      description={counter ? "They get your new proposal." : "They see your note and proposal on their Network tab."}
    >
      <form className="flex flex-col gap-4 pb-2" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        {!counter && (
          <div>
            <Label htmlFor="meet-note">Note</Label>
            <Textarea id="meet-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} className="min-h-20" placeholder="Catch up after the talk?" />
          </div>
        )}

        <div>
          <Label>Where and when</Label>
          <Segmented value={mode} onChange={setMode} options={options} className="w-full [&>button]:flex-1 [&>button]:whitespace-nowrap [&>button]:px-2 [&>button]:text-xs sm:[&>button]:text-sm" />
        </div>

        {mode === "session" && (
          <div>
            <Label htmlFor="meet-session">Session you both planned</Label>
            <select id="meet-session" className={SELECT} value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
              {sessions.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </div>
        )}

        {mode === "slot" && (
          <div>
            <Label>Times you are both free</Label>
            <div className="flex flex-wrap gap-2" role="radiogroup">
              {slots.map((s, i) => (
                <button
                  key={s.from}
                  type="button"
                  role="radio"
                  aria-checked={i === slotIdx}
                  onClick={() => setSlotIdx(i)}
                  className={cn(
                    "h-8 rounded-md border px-2.5 text-xs tabular transition duration-fast",
                    i === slotIdx ? "border-accent bg-accent/10 text-text" : "border-border bg-surface text-muted hover:text-text",
                  )}
                >
                  <span className="text-faint">{fmtDay(s.from).split(",")[0]} </span>{fmtRange(s.from, s.to)}
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === "place" && (
          <div>
            <Label htmlFor="meet-place">Place</Label>
            <Input id="meet-place" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Expo Hall" />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" loading={busy} disabled={!proposal}>{counter ? "Send suggestion" : "Send request"}</Button>
        </div>
      </form>
    </Drawer>
  );
}
