"use client";
// Toggle topic chips from the conference's topic list, filtered by typing. Selected chips always show first.
import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { cn } from "@/lib/ui/cn";

const SHOWN = 8;

export function TopicPicker({ topics, value, onChange, idPrefix }: { topics: string[]; value: string[]; onChange(v: string[]): void; idPrefix: string }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rest = topics.filter((t) => !value.includes(t) && (!needle || t.toLowerCase().includes(needle)));
    return [...value, ...rest.slice(0, needle ? 30 : SHOWN)];
  }, [topics, value, q]);
  const toggle = (t: string) => onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t]);

  if (topics.length === 0) return null;
  return (
    <div>
      <div className="relative mb-2 max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" aria-hidden />
        <input
          id={`${idPrefix}-topic-filter`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Filter ${topics.length} topics`}
          aria-label="Filter topics"
          className="h-10 w-full rounded-md border border-border bg-bg pl-8 pr-2 text-xs text-text placeholder:text-faint focus:border-accent focus:outline-none md:h-8"
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {list.map((t) => {
          const on = value.includes(t);
          return (
            <button
              key={t}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(t)}
              className={cn(
                "inline-flex h-10 items-center gap-1 rounded-md border px-2.5 text-xs transition duration-fast md:h-7",
                on ? "border-border bg-accent shadow-hardSm text-text" : "border-border bg-surface text-muted hover:border-borderStrong hover:text-text",
              )}
            >
              {on && <Check className="size-3" aria-hidden />}
              {t}
            </button>
          );
        })}
        {list.length === value.length && q && <span className="self-center text-xs text-faint">No topic matches “{q}”.</span>}
      </div>
    </div>
  );
}
