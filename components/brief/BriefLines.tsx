"use client";
import { useState } from "react";
import Link from "next/link";
import { GitBranch } from "lucide-react";
import type { BriefSection, WhyPath } from "@/lib/types";
import { Card, SectionHeader } from "@/components/ui";
import { colorOf, graphHref } from "@/lib/ui/tokens";

/** One brief line: tap → /graph with its cited path highlighted; hover/focus shows the path sentence. */
function BriefLineItem({ text, path, confId }: { text: string; path?: WhyPath; confId: string }) {
  const [show, setShow] = useState(false);
  if (!path) {
    return (
      <li className="flex items-start gap-2.5 py-2.5 text-sm leading-6 text-text">
        <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-faint" aria-hidden />
        <span>{text}</span>
      </li>
    );
  }
  const ids = Array.from(new Set(path.nodes.map((n) => n.id)));
  return (
    <li>
      <Link
        href={graphHref(ids, confId)}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        className="group -mx-2 flex items-start gap-2.5 rounded-2xl border-2 border-transparent px-2 py-2 text-left transition duration-fast hover:border-border hover:bg-surface2 hover:shadow-hardSm focus-visible:border-border focus-visible:bg-surface2 focus-visible:outline-none"
        aria-describedby={`why-${path.id}`}
      >
        <span className="mt-[8px] size-2.5 shrink-0 rounded-full ring-[1.5px] ring-ink" style={{ background: colorOf(path.nodes[0]?.label ?? "Topic") }} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm leading-6 text-text">{text}</span>
          <span
            id={`why-${path.id}`}
            className={`block text-xs leading-5 text-muted transition-opacity duration-fast md:h-0 md:overflow-hidden ${show ? "md:h-auto md:opacity-100" : "md:opacity-0"}`}
          >
            {path.text}
          </span>
        </span>
        <GitBranch className="mt-1.5 size-3.5 shrink-0 text-faint group-hover:text-text" aria-label="Show path in graph" />
      </Link>
    </li>
  );
}

const BANDS = ["#FFD23F", "#FF6FAE", "#4DA3FF", "#3DDC97", "#A78BFA", "#FF8C42"];

export function BriefSections({ sections, paths, confId }: { sections: BriefSection[]; paths: WhyPath[]; confId: string }) {
  const byId = new Map(paths.map((p) => [p.id, p]));
  return (
    <div className="grid gap-5 md:grid-cols-2">
      {sections.map((s, i) => (
        <Card key={s.title} className="p-0">
          <div className="border-b-2 border-border px-4 py-2.5" style={{ background: BANDS[i % BANDS.length] }}>
            <h2 className="font-heading text-sm font-bold uppercase tracking-wide text-ink">{s.title}</h2>
          </div>
          <ul className="flex flex-col gap-0.5 px-4 py-2">
            {s.lines.map((l, i) => <BriefLineItem key={i} text={l.text} path={byId.get(l.pathId)} confId={confId} />)}
          </ul>
        </Card>
      ))}
    </div>
  );
}
