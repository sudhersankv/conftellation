// Module-boundary fakes. Use inside vi.mock factories via dynamic import (factories are hoisted):
//   vi.mock("@/lib/llm", async (orig) => (await import("./fakes")).fakeLlm(await orig()));
import type * as Llm from "@/lib/llm";

export function fakeLlm(orig: typeof Llm, structuredImpl?: (...args: unknown[]) => unknown) {
  return {
    ...orig,
    hasLLM: () => Boolean(structuredImpl),
    embedderName: () => "fake-hash-v1",
    embed: async (texts: string[]) => texts.map(orig.fakeEmbed),
    embedOne: async (t: string) => orig.fakeEmbed(t),
    structured: async (...args: unknown[]) => {
      if (!structuredImpl) throw new Error("structured() not faked in this test");
      return structuredImpl(...args);
    },
  };
}
