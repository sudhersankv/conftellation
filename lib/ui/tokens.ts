// Node/type colours (spec §12). The only colour-coding in the UI; use for dots, tags, graph nodes, calendar block edges.
import type { NodeLabel, SkyNodeType } from "@/lib/types";

export const TYPE_COLOR: Record<SkyNodeType, string> = {
  goal: "#F2C14E", problem: "#F2C14E", session: "#8B7CF6", person: "#F28B5B", company: "#4FD1A0", booth: "#4FD1A0",
  moment: "#FFFFFF", user: "#4FC3D9", conference: "#8E8EA3", topic: "#8E8EA3", meet: "#4FC3D9",
};

export const TYPE_LABEL: Record<SkyNodeType, string> = {
  goal: "Goal", problem: "Problem", session: "Session", person: "Person", company: "Company", booth: "Booth",
  moment: "Note", user: "Attendee", conference: "Conference", topic: "Topic", meet: "Meet",
};

/** Graph node label → UI type. */
export function typeOf(label: NodeLabel): SkyNodeType {
  const map: Record<NodeLabel, SkyNodeType> = {
    Conference: "conference", Session: "session", Person: "person", Company: "company", Booth: "booth", Topic: "topic",
    User: "user", Goal: "goal", Problem: "problem", Moment: "moment", Steer: "topic", Meet: "meet", Summary: "topic",
  };
  return map[label] ?? "topic";
}

export const colorOf = (label: NodeLabel) => TYPE_COLOR[typeOf(label)];

/** Build a /graph highlight link for a set of node ids. */
export const graphHref = (ids: string[], confId?: string) =>
  `/graph?hl=${encodeURIComponent(ids.join(","))}${confId ? `&conf=${encodeURIComponent(confId)}` : ""}`;

export const EASE = { out: [0.16, 1, 0.3, 1] as const };
