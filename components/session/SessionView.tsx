"use client";
// /sessions/[id]: details, capture row, memo, my notes & photos, community tab.
import Link from "next/link";
import { useMemo, useState } from "react";
import { Camera, Copy, GitBranch, MapPin, Mic, Pencil, Share2, StickyNote, UserPlus } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import type { CommunityResponse, Moment, MomentKind } from "@/lib/types";
import { api, mediaSrc } from "@/lib/client";
import { apiKey, useApi } from "@/lib/ui/use-api";
import { useSession } from "@/lib/ui/session-context";
import { fmtDay, fmtRange, fmtTime } from "@/lib/ui/format";
import { graphHref } from "@/lib/ui/tokens";
import { Button, Card, Chip, CollectedAgo, EmptyState, ErrorState, SectionHeader, Segmented, Skeleton, Textarea } from "@/components/ui";
import { CaptureRow, capture } from "./CaptureRow";

const MEMO = /^memo:\s*/i;
const KIND_ICON: Record<MomentKind, typeof StickyNote> = { checkin: MapPin, note: StickyNote, photo: Camera, met: UserPlus, voice: Mic };
const KIND_LABEL: Record<MomentKind, string> = { checkin: "Checked in", note: "Note", photo: "Photo", met: "Met someone", voice: "Voice" };

export function SessionView({ sessionId }: { sessionId: string }) {
  const { userId } = useSession();
  const { data, error, loading, reload } = useApi(apiKey("community", sessionId, userId), () => api.community(sessionId, userId), { pollMs: 30000 });
  const [tab, setTab] = useState<"mine" | "community">("mine");

  if (error && !data) return <ErrorState what="this session" detail={error.message} onRetry={reload} />;
  if (loading || !data) return <div className="flex flex-col gap-3"><Skeleton rows={1} rowClassName="h-24" /><Skeleton rows={3} /></div>;

  const s = data.session;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header>
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <Chip kind="time">{fmtDay(s.start)} · {fmtRange(s.start, s.end)}</Chip>
          {s.room && <Chip kind="room">{s.room}</Chip>}
          <Chip kind="status" className="capitalize">{s.kind}</Chip>
        </div>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{s.title}</h1>
        {s.speakers.length > 0 && (
          <p className="mt-1.5 text-sm text-muted">
            {s.speakers.map((p, i) => (
              <span key={p.id}>
                {i > 0 && ", "}
                <Link href={`/people/${encodeURIComponent(p.id)}`} className="text-text underline-offset-2 hover:underline">{p.name}</Link>
                {p.company && <span className="text-muted"> · {p.company}</span>}
              </span>
            ))}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <CollectedAgo at={s.collectedAt} source={s.source} />
          <Link href={graphHref([s.id])} className="inline-flex items-center gap-1 text-xs text-muted hover:text-text"><GitBranch className="size-3" />Show in graph</Link>
        </div>
        {s.topics.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{s.topics.map((t) => <Chip key={t}>{t}</Chip>)}</div>}
        {s.abstract && <p className="mt-3 text-sm leading-6 text-muted">{s.abstract}</p>}
      </header>

      <CaptureRow userId={userId} confId={s.conferenceId} sessionId={s.id} onSaved={reload} />

      <Segmented value={tab} onChange={setTab} options={[{ value: "mine", label: "Mine" }, { value: "community", label: `Community${data.sharedNotes.length ? ` · ${data.sharedNotes.length}` : ""}` }]} className="self-start" />

      {tab === "mine" ? <Mine data={data} userId={userId} onSaved={reload} /> : <Community data={data} />}
    </div>
  );
}

function Mine({ data, userId, onSaved }: { data: CommunityResponse; userId: string; onSaved(): void }) {
  const sorted = useMemo(() => [...data.myMoments].sort((a, b) => b.at.localeCompare(a.at)), [data.myMoments]);
  const memo = sorted.find((m) => m.kind === "note" && MEMO.test(m.text ?? ""));
  const rest = sorted.filter((m) => !(m.kind === "note" && MEMO.test(m.text ?? "")));
  return (
    <>
      <MemoCard key={memo?.id ?? "none"} memo={memo} userId={userId} confId={data.session.conferenceId} sessionId={data.session.id} onSaved={onSaved} onExport={() => exportMemo(data, memo, rest)} />
      <section>
        <SectionHeader title="My notes & photos" count={rest.length} />
        {rest.length === 0 ? (
          <EmptyState text="Nothing captured yet. Check in or add a note above." />
        ) : (
          <ul className="flex flex-col gap-2">{rest.map((m) => <MomentRow key={m.id} m={m} onShared={onSaved} />)}</ul>
        )}
      </section>
    </>
  );
}

/** Markdown document: title, time/room, memo, notes (bullets with time), photos. */
function memoMarkdown(data: CommunityResponse, memo: Moment | undefined, rest: Moment[]) {
  const s = data.session;
  const chrono = [...rest].sort((a, b) => a.at.localeCompare(b.at));
  const notes = chrono.filter((m) => m.text && m.kind !== "photo");
  const photos = chrono.filter((m) => m.mediaUrl);
  const lines = [`# ${s.title}`, "", `${fmtDay(s.start)} · ${fmtRange(s.start, s.end)}${s.room ? ` · ${s.room}` : ""}`, ""];
  const body = memo?.text?.replace(MEMO, "").trim();
  if (body) lines.push(body, "");
  lines.push("## Notes", "");
  if (notes.length) for (const n of notes) lines.push(`- ${fmtTime(n.at)}: ${(n.text ?? "").replace(/\s*\n\s*/g, " ")}`);
  else lines.push("_None_");
  lines.push("", "## Photos", "");
  if (photos.length) for (const p of photos) lines.push(`![photo](${p.mediaUrl})`);
  else lines.push("_None_");
  return lines.join("\n") + "\n";
}

async function exportMemo(data: CommunityResponse, memo: Moment | undefined, rest: Moment[]) {
  try {
    await navigator.clipboard.writeText(memoMarkdown(data, memo, rest));
    toast("Copied");
  } catch (e) {
    toast.error(`Couldn't copy: ${e instanceof Error ? e.message : "clipboard blocked"}`);
  }
}

const MD_COMPONENTS: Components = {
  h1: ({ children }) => <h3 className="mb-1 mt-3 font-heading text-base font-bold first:mt-0">{children}</h3>,
  h2: ({ children }) => <h4 className="mb-1 mt-3 font-heading text-sm font-bold first:mt-0">{children}</h4>,
  h3: ({ children }) => <h5 className="mb-1 mt-2 font-heading text-sm font-bold first:mt-0">{children}</h5>,
  p: ({ children }) => <p className="my-1.5 text-sm leading-6 text-text first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-1.5 list-disc pl-5 text-sm leading-6">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 list-decimal pl-5 text-sm leading-6">{children}</ol>,
  a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2" onClick={(e) => e.stopPropagation()}>{children}</a>,
  code: ({ children }) => <code className="rounded bg-surface2 px-1 font-mono text-[12px]">{children}</code>,
  strong: ({ children }) => <strong className="font-bold">{children}</strong>,
};

function MemoCard({ memo, userId, confId, sessionId, onSaved, onExport }: { memo?: Moment; userId: string; confId: string; sessionId: string; onSaved(): void; onExport(): void }) {
  const current = memo?.text?.replace(MEMO, "") ?? "";
  const [editing, setEditing] = useState(!memo);
  const [text, setText] = useState(current);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await capture(userId, { confId, kind: "note", targetId: sessionId, text: `memo: ${text.trim()}`, shared: false }, "Memo saved");
      onSaved();
    } catch (e) {
      toast.error(`Couldn't save memo: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally { setBusy(false); }
  };
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-heading text-sm font-bold">Personal memo</h2>
        <div className="flex items-center gap-2">
          {memo && <span className="text-xs text-faint">Updated {fmtTime(memo.at)}</span>}
          {memo && !editing && <Button variant="ghost" size="sm" className="px-2" onClick={() => setEditing(true)}><Pencil className="size-3.5" />Edit</Button>}
          <Button variant="secondary" size="sm" className="px-2" onClick={onExport}><Copy className="size-3.5" />Export memo</Button>
        </div>
      </div>
      {editing ? (
        <>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="What you learned, follow-ups, how it ties to your goal" aria-label="Personal memo" />
          <div className="mt-2 flex justify-end gap-2">
            {memo && <Button variant="ghost" size="sm" onClick={() => { setText(current); setEditing(false); }}>Cancel</Button>}
            <Button size="sm" loading={busy} disabled={!text.trim() || text.trim() === current.trim()} onClick={save}>Save memo</Button>
          </div>
        </>
      ) : (
        <div className="text-text">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>{current}</ReactMarkdown>
        </div>
      )}
      <p className="mt-2 text-xs text-faint">Markdown works: **bold**, - lists, # headings</p>
    </Card>
  );
}

function MomentRow({ m, onShared }: { m: Moment; onShared(): void }) {
  const { userId } = useSession();
  const Icon = KIND_ICON[m.kind] ?? StickyNote;
  const [busy, setBusy] = useState(false);
  const share = async () => {
    setBusy(true);
    try { await api.shareMoment(m.id, "network", userId); toast("Shared with attendees"); onShared(); }
    catch (e) { toast.error(`Couldn't share: ${e instanceof Error ? e.message : "unknown error"}`); }
    finally { setBusy(false); }
  };
  return (
    <li className="flex gap-3 rounded-xl border-2 border-border bg-surface p-3 shadow-hardSm">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>{KIND_LABEL[m.kind]}</span><span className="tabular text-faint">{fmtTime(m.at)}</span>
        </div>
        {m.text && <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-text">{m.text}</p>}
        {m.mediaUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaSrc(m.mediaUrl, { userId })} alt="" className="mt-2 max-h-64 rounded-lg border-2 border-border object-cover" loading="lazy" />
        )}
      </div>
      {(m.kind === "note" || m.kind === "photo") && (
        m.shared
          ? <span className="h-6 shrink-0 self-start rounded-md border border-border px-2 text-xs leading-6 text-faint">Shared</span>
          : <Button variant="ghost" size="sm" className="shrink-0 self-start px-2" loading={busy} onClick={share}><Share2 className="size-3.5" />Share</Button>
      )}
    </li>
  );
}

function Community({ data }: { data: CommunityResponse }) {
  const { userId } = useSession();
  const noteIds = new Set(data.sharedNotes.map((n) => n.id));
  const jump = (id: string) => {
    const el = document.getElementById(`moment-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-1", "ring-accent");
    setTimeout(() => el.classList.remove("ring-1", "ring-accent"), 1600);
  };
  const max = Math.max(1, ...data.hotMoments.map((h) => h.count));
  const step = Math.max(1, Math.ceil(data.hotMoments.length / 6));
  return (
    <>
      <section>
        <SectionHeader title="Crowd summary" action={data.crowdSummary && <span className="text-xs text-faint">as of {fmtTime(data.crowdSummary.updatedAt)}</span>} />
        {data.crowdSummary && data.crowdSummary.lines.length > 0 ? (
          <ul className="flex flex-col gap-2 rounded-xl border-2 border-border bg-surface p-3 shadow-hardSm">
            {data.crowdSummary.lines.map((l, i) => (
              <li key={i} className="flex items-start gap-2 text-sm leading-6 text-text">
                <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                <span className="min-w-0 flex-1">
                  {l.text}{" "}
                  {noteIds.has(l.momentId)
                    ? <button type="button" onClick={() => jump(l.momentId)} className="font-mono text-[10px] text-faint hover:text-text">[{l.momentId}]</button>
                    : <span className="font-mono text-[10px] text-faint">[{l.momentId}]</span>}
                </span>
              </li>
            ))}
          </ul>
        ) : <EmptyState text="No summary yet. It appears once a few attendees share notes." />}
      </section>

      <section>
        <SectionHeader title="Hot moments" />
        {data.hotMoments.length > 0 ? (
          <div className="rounded-xl border-2 border-border bg-surface p-3 shadow-hardSm">
            <div className="flex h-24 items-end gap-1">
              {data.hotMoments.map((h) => (
                <div key={h.binStart} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${fmtTime(h.binStart)} · ${h.count} captures`}>
                  <span className="tabular text-[10px] text-muted">{h.count}</span>
                  <div className="w-full max-w-8 rounded-sm bg-accent/70" style={{ height: `${Math.max(6, (h.count / max) * 64)}px` }} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-1">
              {data.hotMoments.map((h, i) => (
                <span key={h.binStart} className="tabular min-w-0 flex-1 truncate text-center text-[10px] text-faint">{i % step === 0 ? fmtTime(h.binStart).replace(/\s?[AP]M$/, "") : ""}</span>
              ))}
            </div>
          </div>
        ) : <EmptyState text="No capture spikes yet." />}
      </section>

      <section>
        <SectionHeader title="Shared notes" count={data.sharedNotes.length} />
        {data.sharedNotes.length === 0 ? (
          <EmptyState text="No one has shared notes from this session yet." />
        ) : (
          <ul className="flex flex-col gap-2">
            {[...data.sharedNotes].sort((a, b) => a.at.localeCompare(b.at)).map((n) => (
              <li key={n.id} id={`moment-${n.id}`} className="rounded-xl border-2 border-border bg-surface p-3 shadow-hardSm transition duration-fast">
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span className="text-text">{n.author}</span><span className="tabular text-faint">{fmtTime(n.at)}</span>
                </div>
                {n.text && <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-text">{n.text}</p>}
                {n.mediaUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaSrc(n.mediaUrl, { userId, momentId: n.id })} alt="" className="mt-2 max-h-64 rounded-lg border-2 border-border object-cover" loading="lazy" />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
