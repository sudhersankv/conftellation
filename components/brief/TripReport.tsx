"use client";
import { useState } from "react";
import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { Copy, GitBranch, RefreshCw } from "lucide-react";
import { api } from "@/lib/client";
import { apiKey, useApi } from "@/lib/ui/use-api";
import { graphHref } from "@/lib/ui/tokens";
import { Button, Card, EmptyState, ErrorState, Skeleton, StatusLine, buttonClass } from "@/components/ui";

const MD: Components = {
  h1: ({ children }) => <h1 className="text-lg font-semibold tracking-tight text-text">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-5 text-base font-semibold text-text">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-4 text-sm font-semibold text-text">{children}</h3>,
  p: ({ children }) => <p className="mt-2 text-sm leading-6 text-muted">{children}</p>,
  ul: ({ children }) => <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-muted marker:text-faint">{children}</ul>,
  ol: ({ children }) => <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-6 text-muted marker:text-faint">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-text">{children}</strong>,
  a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-text underline underline-offset-2">{children}</a>,
  code: ({ children }) => <code className="rounded bg-surface2 px-1 py-0.5 text-xs text-text">{children}</code>,
  hr: () => <hr className="my-4 border-border" />,
  blockquote: ({ children }) => <blockquote className="mt-2 border-l-2 border-border pl-3 text-muted">{children}</blockquote>,
  table: ({ children }) => <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm text-muted">{children}</table></div>,
  th: ({ children }) => <th className="border-b border-border px-2 py-1.5 text-xs font-semibold text-text">{children}</th>,
  td: ({ children }) => <td className="border-b border-border px-2 py-1.5">{children}</td>,
};

export function TripReport({ userId, confId }: { userId: string; confId: string }) {
  const tr = useApi(apiKey("tripReport", userId, confId), () => api.tripReport(userId, confId));
  const [regen, setRegen] = useState(false);

  const regenerate = async () => {
    setRegen(true);
    try {
      const prev = tr.data?.markdown;
      const next = await api.tripReport(userId, confId, { regenerate: true });
      tr.mutate(next);
      if (prev && next.markdown === prev) toast("No change");
      else toast.success("Trip report rewritten");
    } catch (e) {
      toast.error(`Couldn't regenerate: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRegen(false);
    }
  };

  const copy = async () => {
    if (!tr.data) return;
    try {
      await navigator.clipboard.writeText(tr.data.markdown);
      toast.success("Markdown copied");
    } catch {
      toast.error("Clipboard blocked by the browser");
    }
  };

  if (tr.error && !tr.data) return <ErrorState what="the trip report" detail={tr.error.message} onRetry={tr.reload} />;
  if (!tr.data) return <Card><Skeleton rows={5} rowClassName="h-5" /></Card>;

  const ids = Array.from(new Set(tr.data.paths.flatMap((p) => p.nodes.map((n) => n.id))));
  const empty = !tr.data.markdown.trim();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusLine>Written from {tr.data.paths.length} graph {tr.data.paths.length === 1 ? "path" : "paths"}</StatusLine>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={copy} disabled={empty}><Copy className="size-3.5" aria-hidden />Copy markdown</Button>
          {ids.length > 0 && (
            <Link href={graphHref(ids, confId)} className={buttonClass({ variant: "secondary", size: "sm" })}><GitBranch className="size-3.5" aria-hidden />Open in graph</Link>
          )}
          <Button size="sm" variant="ghost" onClick={regenerate} loading={regen}>{!regen && <RefreshCw className="size-3.5" aria-hidden />}Regenerate</Button>
        </div>
      </div>
      {regen && <StatusLine className="animate-pulse">Recapper is rewriting your trip report from the graph…</StatusLine>}
      {empty ? (
        <EmptyState title="No trip report yet" text="Capture a few notes and check-ins, then regenerate." />
      ) : (
        <Card className={regen ? "opacity-50 transition-opacity" : "transition-opacity"}>
          <article className="max-w-3xl">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>{tr.data.markdown}</ReactMarkdown>
          </article>
        </Card>
      )}
    </div>
  );
}
