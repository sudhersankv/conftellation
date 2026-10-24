"use client";
// Capture row on a session page: Check in · Note · Photo · Met someone. One tap to open, one to save.
import { useEffect, useRef, useState } from "react";
import { Camera, MapPin, StickyNote, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import type { CreateMomentFields, Person } from "@/lib/types";
import { api, momentForm } from "@/lib/client";
import { cn } from "@/lib/ui/cn";
import { Avatar, Button, Input, Textarea } from "@/components/ui";

type Mode = null | "note" | "met";

export function litToast(n: number, what = "Saved") {
  toast(`${what} · ${n} ${n === 1 ? "star" : "stars"} lit`);
}

export async function capture(userId: string, fields: CreateMomentFields, what?: string) {
  const res = await api.createMoment(userId, momentForm(fields));
  litToast(res.lit.length, what);
  return res;
}

export function CaptureRow({ userId, confId, sessionId, onSaved }: { userId: string; confId: string; sessionId: string; onSaved(): void }) {
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [photoShared, setPhotoShared] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (key: string, fields: Omit<CreateMomentFields, "confId" | "targetId">, what?: string) => {
    setBusy(key);
    try {
      await capture(userId, { confId, targetId: sessionId, ...fields }, what);
      setMode(null);
      onSaved();
      return true;
    } catch (e) {
      toast.error(`Couldn't save: ${e instanceof Error ? e.message : "unknown error"}`);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const btn = (active: boolean) => cn(
    "press-sm flex h-12 w-full min-w-0 flex-row items-center justify-center gap-2 rounded-full border-2 border-border font-heading text-sm font-bold text-ink shadow-hardSm disabled:opacity-40",
    active ? "bg-accent" : "bg-surface hover:bg-surface2",
  );

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button type="button" className={btn(false)} disabled={busy === "checkin"} onClick={() => run("checkin", { kind: "checkin" }, "Checked in")}>
          <MapPin className="size-4" />Check in
        </button>
        <button type="button" className={btn(mode === "note")} onClick={() => setMode(mode === "note" ? null : "note")}>
          <StickyNote className="size-4" />Note
        </button>
        <button type="button" className={btn(false)} disabled={busy === "photo"} onClick={() => fileRef.current?.click()}>
          <Camera className="size-4" />{busy === "photo" ? "Saving" : "Photo"}
        </button>
        <button type="button" className={btn(mode === "met")} onClick={() => setMode(mode === "met" ? null : "met")}>
          <UserPlus className="size-4" />Met
        </button>
      </div>
      <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 text-xs text-muted">
        <input type="checkbox" checked={photoShared} onChange={(e) => setPhotoShared(e.target.checked)} className="size-4 accent-[#111111]" />
        Share photos with attendees
      </label>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void run("photo", { kind: "photo", file, shared: photoShared }, "Photo saved");
        }}
      />
      {mode === "note" && <NoteForm busy={busy === "note"} onCancel={() => setMode(null)} onSave={(text, shared) => run("note", { kind: "note", text, shared })} />}
      {mode === "met" && <MetForm confId={confId} busy={busy === "met"} onCancel={() => setMode(null)} onSave={(f) => run("met", { kind: "met", ...f }, "Met")} />}
    </div>
  );
}

function NoteForm({ busy, onSave, onCancel }: { busy: boolean; onSave(text: string, shared: boolean): Promise<boolean>; onCancel(): void }) {
  const [text, setText] = useState("");
  const [shared, setShared] = useState(false);
  return (
    <form
      className="mt-3 rounded-xl border-2 border-border bg-surface p-3 shadow-hard"
      onSubmit={(e) => { e.preventDefault(); if (text.trim()) void onSave(text.trim(), shared); }}
    >
      <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="What stood out" className="min-h-20" aria-label="Note" />
      <div className="mt-2 flex items-center justify-between gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} className="size-4 accent-[#111111]" />
          Share with attendees
        </label>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button type="submit" size="sm" loading={busy} disabled={!text.trim()}>Save note</Button>
        </div>
      </div>
    </form>
  );
}

function MetForm({ confId, busy, onSave, onCancel }: { confId: string; busy: boolean; onSave(f: { personId?: string; newPersonName?: string; newPersonCompany?: string }): Promise<boolean>; onCancel(): void }) {
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setPeople([]); return; }
    let live = true;
    setSearching(true);
    const t = setTimeout(() => {
      api.search(confId, term)
        .then((r) => { if (live) setPeople(r.people.slice(0, 6)); })
        .catch(() => { if (live) setPeople([]); })
        .finally(() => { if (live) setSearching(false); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [q, confId]);

  return (
    <div className="mt-3 rounded-xl border-2 border-border bg-surface p-3 shadow-hard">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted">{adding ? "Add someone new" : "Who did you meet"}</span>
        <button type="button" onClick={onCancel} className="rounded-md p-1 text-muted hover:text-text" aria-label="Close"><X className="size-4" /></button>
      </div>
      {adding ? (
        <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void onSave({ newPersonName: name.trim(), newPersonCompany: company.trim() || undefined }); }}>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Name" />
          <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company (optional)" aria-label="Company" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>Back</Button>
            <Button type="submit" size="sm" loading={busy} disabled={!name.trim()}>Save</Button>
          </div>
        </form>
      ) : (
        <>
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people at this conference" aria-label="Search people" />
          <ul className="mt-2 flex flex-col">
            {people.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onSave({ personId: p.id })}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-surface2 disabled:opacity-50"
                >
                  <Avatar name={p.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-text">{p.name}</span>
                    {(p.title || p.company) && <span className="block truncate text-xs text-muted">{[p.title, p.company].filter(Boolean).join(" @ ")}</span>}
                  </span>
                </button>
              </li>
            ))}
            {q.trim().length >= 2 && !searching && people.length === 0 && <li className="px-2 py-2 text-xs text-muted">No one matches.</li>}
          </ul>
          <button type="button" onClick={() => { setAdding(true); setName(q); }} className="mt-1 flex items-center gap-2 rounded-md px-2 py-2 text-sm text-text hover:bg-surface2">
            <UserPlus className="size-4" />Add new{q.trim() ? `: ${q.trim()}` : ""}
          </button>
        </>
      )}
    </div>
  );
}
