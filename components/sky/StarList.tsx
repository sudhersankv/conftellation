"use client";
// Screen-reader and keyboard route to every star; becomes visible while focused.
import type { SkyNodeState, SkyNodeType } from "@/lib/types";
import { useSky } from "@/lib/ui/sky-store";
import { useSkyView } from "@/lib/ui/sky/view-store";

const TYPE_NAME: Record<SkyNodeType, string> = {
  goal: "Goal", problem: "Team problem", session: "Session", person: "Person", booth: "Booth", company: "Company",
  moment: "Note", user: "Attendee", meet: "Meet", topic: "Topic", conference: "Conference",
};
const STATE_NAME: Record<SkyNodeState, string> = { planned: "planned", done: "done", unplanned: "not in plan", anchor: "", dust: "", skipped: "" };

export function StarList() {
  const nodes = useSkyView((s) => s.nodes);
  const stars = nodes.filter((n) => n.state !== "dust" && n.state !== "skipped" && n.type !== "conference" && !(n.type === "user" && !n.isOtherUser));
  if (!stars.length) return null;
  return (
    <div className="sr-only focus-within:not-sr-only focus-within:pointer-events-auto focus-within:fixed focus-within:inset-x-4 focus-within:top-24 focus-within:z-40 focus-within:max-h-[50vh] focus-within:overflow-auto focus-within:rounded-card focus-within:border focus-within:border-hairline focus-within:bg-ink focus-within:p-3">
      <h2 className="text-micro text-dust">Stars in your sky</h2>
      <ul>
        {stars.map((n) => (
          <li key={n.id}>
            <button type="button" className="min-h-12 w-full rounded-input px-2 text-left text-meta focus-visible:outline focus-visible:outline-2 focus-visible:outline-polaris" onClick={() => useSky.getState().focus(n.id)}>
              {TYPE_NAME[n.type]}: {n.label}{STATE_NAME[n.state] ? `, ${STATE_NAME[n.state]}` : ""}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
