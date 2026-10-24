// LLM adapter (backend only). Embeddings + structured outputs.
// Tests replace this module with vi.mock("@/lib/llm").
// Without OPENAI_API_KEY (or with EMBED_FAKE=true) embed() uses a deterministic
// feature-hashing embedder: lexical, not semantic, but stable and same dimension,
// so the graph and vector indexes work now and can be re-embedded later.
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { ZodType } from "zod";

export const EMBED_DIM = 1536;
const BATCH = 100;

let client: OpenAI | undefined;
function openai(): OpenAI {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
  return (client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));
}

export const hasLLM = () => Boolean(process.env.OPENAI_API_KEY);
const isFakeEmbed = () => process.env.EMBED_FAKE === "true" || !hasLLM();
export const embedderName = () => (isFakeEmbed() ? "fake-hash-v1" : process.env.OPENAI_EMBED_MODEL ?? "text-embedding-3-small");

export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (isFakeEmbed()) return texts.map(fakeEmbed);
  const model = process.env.OPENAI_EMBED_MODEL ?? "text-embedding-3-small";
  const batches: string[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) batches.push(texts.slice(i, i + BATCH).map((t) => t.slice(0, 8000) || " "));
  const out: number[][][] = new Array(batches.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, batches.length) }, async () => {
    while (next < batches.length) {
      const i = next++;
      const res = await openai().embeddings.create({ model, input: batches[i] });
      out[i] = res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
    }
  }));
  return out.flat();
}

export async function embedOne(text: string): Promise<number[]> {
  return (await embed([text]))[0];
}

/** Structured output: the model must return JSON matching `schema`. Throws if no key. */
export async function structured<T>(schema: ZodType<T>, system: string, user: string, name = "result"): Promise<T> {
  const model = process.env.OPENAI_MODEL ?? "gpt-5.4-nano";
  // Reasoning models (gpt-5*, o*) reject temperature; they take reasoning_effort instead.
  const reasoning = /^(gpt-5|o\d)/.test(model);
  const res = await openai().chat.completions.parse({
    model,
    ...(reasoning
      ? { reasoning_effort: (process.env.OPENAI_REASONING_EFFORT ?? "low") as "low" }
      : { temperature: 0 }),
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    response_format: zodResponseFormat(schema as never, name),
  });
  const parsed = res.choices[0]?.message.parsed;
  if (parsed == null) throw new Error(res.choices[0]?.message.refusal ?? "LLM returned no parsable output");
  return parsed as T;
}

// ---------- deterministic fake embedder ----------

const STOP = new Set("a an and are as at be by for from how in is it of on or that the this to with your you we our".split(" "));

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function stem(w: string): string {
  return w.length > 4 ? w.replace(/(ings|ing|ers|er|es|s)$/, "") : w;
}

export function fakeEmbed(text: string): number[] {
  const v = new Array<number>(EMBED_DIM).fill(0);
  const words = text.toLowerCase().replace(/<[^>]+>/g, " ").match(/[a-z0-9]+/g)?.filter((w) => !STOP.has(w)).map(stem) ?? [];
  const add = (feature: string, weight: number) => {
    const h = fnv1a(feature);
    v[h % EMBED_DIM] += (h & 0x80000000 ? -1 : 1) * weight;
  };
  words.forEach((w, i) => {
    add(`w:${w}`, 1);
    if (i > 0) add(`b:${words[i - 1]}_${w}`, 0.5);
  });
  if (words.length === 0) add("w:__empty__", 1);
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}
