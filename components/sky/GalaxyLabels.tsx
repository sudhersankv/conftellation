"use client";
// Conference names over the galaxy. Positions are written straight to the DOM by the canvas painter every frame.
import type { RecordConference } from "@/lib/types";
import { useSky } from "@/lib/ui/sky-store";
import type { Scene, Slot } from "@/lib/ui/sky/types";
import { useGalaxy } from "@/lib/ui/sky/use-galaxy";

const md = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
const my = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
const noon = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`);

/** "Today", "June 2026", "Oct 28–29". */
export function dateLabel(c: RecordConference, kind: Slot["kind"]) {
  const a = noon(c.conference.startDate), b = noon(c.conference.endDate);
  if (kind === "now") return "Today";
  if (kind === "past") return my.format(a);
  if (a.getTime() === b.getTime()) return md.format(a);
  return a.getUTCMonth() === b.getUTCMonth() ? `${md.format(a)}–${b.getUTCDate()}` : `${md.format(a)}–${md.format(b)}`;
}

export function GalaxyLabels({ scene }: { scene: Scene }) {
  const g = useGalaxy();
  const confs = g.data?.record.conferences ?? [];
  return (
    <div className="pointer-events-none fixed inset-0 z-[5] overflow-hidden">
      {confs.map((c) => {
        const id = c.conference.id, slot = scene.slots.get(id);
        const big = slot?.s === 1;
        return (
          <button
            key={id}
            type="button"
            aria-label={`Open ${c.conference.name}`}
            ref={(el) => { if (el) scene.labelEls.set(id, el); else scene.labelEls.delete(id); }}
            onClick={() => useSky.getState().flyTo(id)}
            className="pointer-events-auto invisible absolute left-0 top-0 flex min-h-12 min-w-12 flex-col items-center px-3 py-1 text-center"
          >
            <span className={`font-name italic text-star ${big ? "text-[22px] leading-7" : "text-[17px] leading-6"}`}>{c.conference.name}</span>
            <span className="text-micro text-dust">{dateLabel(c, slot?.kind)}</span>
            <span className="text-micro tabular-nums text-dust">{c.sessions} sessions, {c.people} people</span>
          </button>
        );
      })}
    </div>
  );
}
