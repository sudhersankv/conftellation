// Graph-local neo-brutalist palette. These values mirror the cream theme in lib/ui/tokens.ts (owned by the
// shell/theme work); kept here so the graph can ship without touching shared tokens. Keep them in sync.
import type { SkyNodeType } from "@/lib/types";

export const INK = "#111111";
export const CREAM = "#FFF7E8";
export const PAPER = "#FFFFFF";
export const YELLOW = "#FFD23F";

export const NODE_COLOR: Record<SkyNodeType, string> = {
  goal: "#FFD23F", problem: "#FFD23F",
  session: "#A78BFA",
  person: "#FF8C42",
  booth: "#3DDC97", company: "#3DDC97",
  moment: "#111111",
  user: "#4DA3FF", meet: "#4DA3FF",
  conference: "#B8B2C2",
  topic: "#FFFFFF",
};

export function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const ACRONYMS: Record<string, string> = {
  ai: "AI", llm: "LLM", llms: "LLMs", gpu: "GPU", gpus: "GPUs", api: "API", apis: "APIs", otel: "OTel", ml: "ML",
  rag: "RAG", graphrag: "GraphRAG", sdk: "SDK", ui: "UI", ux: "UX", cpu: "CPU", sql: "SQL", ci: "CI", cd: "CD",
  mcp: "MCP", sre: "SRE", devops: "DevOps", saas: "SaaS", k8s: "K8s",
};
const SMALL = new Set(["a", "an", "and", "as", "at", "for", "in", "of", "on", "or", "the", "to", "vs", "via", "with"]);

/**
 * Title-case labels that start lowercase ("fix agent tracing" → "Fix Agent Tracing"), keeping acronyms and any
 * word that already has capitals. Labels that start with a capital (names, session titles) are left as given.
 */
export function titleCase(label: string): string {
  if (!/^[a-z]/.test(label.trim())) return label;
  let i = 0;
  return label.replace(/[A-Za-z0-9][A-Za-z0-9'’]*/g, (w) => {
    const first = i++ === 0;
    if (/[A-Z]/.test(w)) return w;
    if (ACRONYMS[w]) return ACRONYMS[w];
    if (!first && SMALL.has(w)) return w;
    return w[0].toUpperCase() + w.slice(1);
  });
}

export function truncate(s: string, max = 28) {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}
