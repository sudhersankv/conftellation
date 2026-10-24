import type { NodeLabel, SkyNodeState, SkyNodeType } from "@/lib/types";

// Hex values mirror tailwind.config.ts and globals.css.
export const COLORS = { abyss: "#05071A", ink: "#0E1433", nebula: "#1C2452", hairline: "#2A3366", star: "#F2F0FF", dust: "#8C93B8", polaris: "#A78BFA", flare: "#FF6B8B" } as const;
export const STAR = {
  goal: "#FFC861", problem: "#FFC861", session: "#A78BFA", person: "#FF8A5B",
  company: "#5EEAA8", booth: "#5EEAA8", moment: "#FFFFFF", user: "#5CE1E6", meet: "#5CE1E6",
  conference: "#F2F0FF", topic: "#8C93B8",
} as const satisfies Record<SkyNodeType, string>;
/** Base alpha per state (DESIGN §6.2); skipped is hidden. */
export const STATE_ALPHA = { planned: 0.6, done: 1, unplanned: 1, skipped: 0, dust: 0.25, anchor: 1 } as const satisfies Record<SkyNodeState, number>;
export const MOTION = { tap: 120, sheet: 320, light: 900, fly: 1100, replay: 8000 } as const;
export const EASE: Record<"expo" | "inOut", [number, number, number, number]> = { expo: [0.16, 1, 0.3, 1], inOut: [0.65, 0, 0.35, 1] }; // for motion/react `ease`
const LABEL_TYPE: Record<NodeLabel, SkyNodeType> = {
  Conference: "conference", Session: "session", Person: "person", Company: "company", Booth: "booth", Topic: "topic",
  User: "user", Goal: "goal", Problem: "problem", Moment: "moment", Meet: "meet", Steer: "topic", Summary: "topic",
};
export const labelToType = (l: NodeLabel): SkyNodeType => LABEL_TYPE[l] ?? "topic";
export const starColor = (l: NodeLabel) => STAR[labelToType(l)];
