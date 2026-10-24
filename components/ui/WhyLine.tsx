"use client";
import Link from "next/link";
import { GitBranch } from "lucide-react";
import type { WhyPath } from "@/lib/types";
import { cn } from "@/lib/ui/cn";
import { colorOf, graphHref } from "@/lib/ui/tokens";

/** One "why" sentence with its path dot; links to /graph with the path highlighted. */
export function WhyLine({ paths, confId, className, compact }: { paths: WhyPath[]; confId?: string; className?: string; compact?: boolean }) {
  if (paths.length === 0) return null;
  const path = paths[0];
  const extra = paths.length - 1;
  const ids = Array.from(new Set(paths.flatMap((p) => p.nodes.map((n) => n.id))));
  return (
    <Link
      href={graphHref(ids, confId)}
      onClick={(e) => e.stopPropagation()}
      className={cn("group flex items-start gap-2 text-left text-xs leading-5 text-muted hover:text-text", compact ? "" : "py-1", className)}
      title="Show in graph"
    >
      <span className="mt-[7px] size-1.5 shrink-0 rounded-full" style={{ background: colorOf(path.nodes[0]?.label ?? "Topic") }} aria-hidden />
      <span className="min-w-0">
        {path.text}
        {extra > 0 && <span className="text-faint"> · +{extra} more</span>}
      </span>
      <GitBranch className="ml-auto mt-1 size-3.5 shrink-0 text-faint group-hover:text-accent" aria-hidden />
    </Link>
  );
}

/** All why paths as a list (details views). */
export function WhyList({ paths, confId }: { paths: WhyPath[]; confId?: string }) {
  if (paths.length === 0) return null;
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-surface px-3">
      {paths.map((p) => <li key={p.id}><WhyLine paths={[p]} confId={confId} className="py-2" /></li>)}
    </ul>
  );
}
