// Shared test helpers. Each test file declares the llm/brightdata fakes itself (vi.mock is hoisted per file), see tests/fakes.ts.
import { seedDemo } from "@/seed/demo";

let seeded: Promise<void> | undefined;
/** Seed the _test graph once per test file (PTC + June + personal layer, no GitHub Universe). */
export function seedOnce() {
  if (!process.env.FALKORDB_GRAPH?.endsWith("_test")) throw new Error("refusing to seed a non-test graph");
  return (seeded ??= seedDemo({ githubUniverse: false }));
}

export const req = (url: string, body?: unknown) =>
  new Request(`http://test${url}`, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
