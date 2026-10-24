"use client";
// "Ask your conference brain": GraphRAG Q&A over the user's why paths. Client-only history (last 3, newest first).
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { GitBranch, Loader2, Sparkles } from "lucide-react";
import type { AskResponse, WhyPath } from "@/lib/types";
import { api } from "@/lib/client";
import { cn } from "@/lib/ui/cn";
import { colorOf, graphHref } from "@/lib/ui/tokens";
import { Button, Input, StatusLine } from "@/components/ui";

const EXAMPLES = [
  "Which booth should I visit for my tracing problem?",
  "Who should I follow up with and why?",
  "What did I learn about agent memory?",
];

const MAX_HISTORY = 3;

/** One answer line, rendered like a brief line: type dot, text, link to the highlighted path in /graph, [pN] chip. */
function AnswerLine({ text, path, n, confId }: { text: string; path?: WhyPath; n?: number; confId: string }) {
  if (!path) {
    return (
      <li className="flex items-start gap-2.5 py-2 text-sm leading-6 text-text">
        <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-faint" aria-hidden />
        <span>{text}</span>
      </li>
    );
  }
  const ids = Array.from(new Set(path.nodes.map((x) => x.id)));
  return (
    <li>
      <Link
        href={graphHref(ids, confId)}
        title={path.text}
        className="group -mx-2 flex items-start gap-2.5 rounded-2xl border-2 border-transparent px-2 py-2 text-left transition duration-fast hover:border-border hover:bg-surface2 hover:shadow-hardSm focus-visible:border-border focus-visible:bg-surface2 focus-visible:outline-none"
      >
        <span className="mt-[8px] size-2.5 shrink-0 rounded-full ring-[1.5px] ring-ink" style={{ background: colorOf(path.nodes[0]?.label ?? "Topic") }} aria-hidden />
        <span className="min-w-0 flex-1 text-sm leading-6 text-text">
          {text}
          {n !== undefined && (
            <span className="ml-1.5 inline-flex h-5 items-center rounded-full border-[1.5px] border-border bg-accent px-1.5 align-[1px] font-heading text-[10px] font-bold leading-none text-ink">[p{n}]</span>
          )}
        </span>
        <GitBranch className="mt-1.5 size-3.5 shrink-0 text-faint group-hover:text-text" aria-label="Show path in graph" />
      </Link>
    </li>
  );
}

function Answer({ a, confId }: { a: AskResponse; confId: string }) {
  const idx = new Map(a.paths.map((p, i) => [p.id, i]));
  return (
    <div>
      <p className="text-xs font-medium leading-5 text-muted">&ldquo;{a.question}&rdquo;</p>
      {a.lines.length === 0 ? (
        <p className="mt-1 text-sm leading-6 text-muted">{a.summary ?? "Nothing in your paths answers that yet."}</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-0.5">
          {a.lines.map((l, i) => {
            const k = idx.get(l.pathId);
            return <AnswerLine key={i} text={l.text} path={k === undefined ? undefined : a.paths[k]} n={k === undefined ? undefined : k + 1} confId={confId} />;
          })}
        </ul>
      )}
    </div>
  );
}

export function AskPanel({ userId, confId, compact, className }: { userId: string; confId: string; compact?: boolean; className?: string }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [history, setHistory] = useState<AskResponse[]>([]);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const question = q.trim();
    if (!question || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await api.ask(userId, confId, question);
      setHistory((h) => [{ ...res, question: res.question || question }, ...h].slice(0, MAX_HISTORY));
      setQ("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const hasBody = busy || !!err || history.length > 0;

  const form = (
    <form onSubmit={submit} className="flex items-center gap-2">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Ask your conference brain… e.g. which booth helps with tracing?"
        aria-label="Ask your conference brain"
        className={cn("min-w-0 flex-1", compact && "h-10")}
        disabled={busy}
      />
      <Button type="submit" size={compact ? "sm" : "md"} loading={busy} disabled={!q.trim()} className={compact ? "h-10" : "h-11"}>Ask</Button>
    </form>
  );

  const chips = (
    <div className="flex flex-wrap gap-1.5">
      {EXAMPLES.map((ex) => (
        <button
          key={ex}
          type="button"
          onClick={() => setQ(ex)}
          className="inline-flex min-h-7 items-center rounded-full border-[1.5px] border-border bg-surface px-2.5 py-1 text-left font-heading text-[11px] font-medium leading-4 text-text transition duration-fast hover:bg-accent/40"
        >
          {ex}
        </button>
      ))}
    </div>
  );

  const body = hasBody && (
    <div className="flex flex-col gap-4">
      {busy && (
        <div className="flex items-center gap-2 rounded-lg border-2 border-border bg-[#FFF3C4] px-3 py-2">
          <Loader2 className="size-4 animate-spin text-text" aria-hidden />
          <StatusLine className="text-text">Recapper is reading your paths…</StatusLine>
        </div>
      )}
      {err && <p className="text-sm text-danger" role="alert">Couldn&apos;t answer: {err}</p>}
      {history.map((a, i) => (
        <div key={history.length - i} className={cn(i > 0 && "border-t-2 border-dashed border-border/30 pt-3")}>
          <Answer a={a} confId={confId} />
        </div>
      ))}
      {history.length > 0 && !busy && (
        <button type="button" onClick={() => { setHistory([]); setErr(null); }} className="self-start text-xs font-semibold text-muted underline-offset-2 hover:text-text hover:underline">
          Clear
        </button>
      )}
    </div>
  );

  if (compact) {
    return (
      <div className={cn("flex w-full flex-col gap-2", className)}>
        <div className="rounded-xl border-2 border-border bg-surface p-2 shadow-hard">
          {form}
          {history.length === 0 && !busy && <div className="mt-2">{chips}</div>}
        </div>
        {body && <div className="max-h-[50dvh] overflow-y-auto rounded-xl border-2 border-border bg-surface p-3 shadow-hard">{body}</div>}
      </div>
    );
  }

  return (
    <section className={cn("w-full rounded-xl border-2 border-border bg-surface p-4 shadow-hard", className)} aria-label="Ask your conference brain">
      <h2 className="mb-3 flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-wide text-text">
        <Sparkles className="size-4" aria-hidden />Ask your conference brain
      </h2>
      {form}
      <div className="mt-2.5">{chips}</div>
      {body && <div className="mt-4 border-t-2 border-border pt-3">{body}</div>}
    </section>
  );
}
