// FalkorDB client singleton + query helper. Server-only.
import { FalkorDB, type Graph } from "falkordb";

const GRAPH = process.env.FALKORDB_GRAPH ?? "conftellations";

declare global {
  // eslint-disable-next-line no-var
  var __falkor: Promise<FalkorDB> | undefined; // survives Next dev hot reloads
}

function connect(): Promise<FalkorDB> {
  const tls = process.env.FALKORDB_TLS === "true";
  if (process.env.FALKORDB_HOST) {
    return FalkorDB.connect({
      username: process.env.FALKORDB_USERNAME || undefined,
      password: process.env.FALKORDB_PASSWORD || undefined,
      socket: {
        host: process.env.FALKORDB_HOST,
        port: Number(process.env.FALKORDB_PORT ?? 6379),
        tls,
        connectTimeout: 10_000,
      } as never,
    });
  }
  return FalkorDB.connect({ url: process.env.FALKORDB_URL ?? "falkor://localhost:6379" });
}

export async function db(): Promise<FalkorDB> {
  globalThis.__falkor ??= connect().catch((e) => {
    globalThis.__falkor = undefined;
    throw e;
  });
  return globalThis.__falkor;
}

export async function graph(name = GRAPH): Promise<Graph> {
  return (await db()).selectGraph(name);
}

/** Run Cypher and return rows as plain objects. */
export async function q<T = Record<string, unknown>>(cypher: string, params: Record<string, unknown> = {}): Promise<T[]> {
  const g = await graph();
  const res = await g.query<T>(cypher, { params: params as never });
  return (res.data ?? []) as T[];
}

export async function ro<T = Record<string, unknown>>(cypher: string, params: Record<string, unknown> = {}): Promise<T[]> {
  const g = await graph();
  const res = await g.roQuery<T>(cypher, { params: params as never });
  return (res.data ?? []) as T[];
}

/** Inline vector literal. FalkorDB docs only show inline vectors in vector queries. */
export function vecf32(v: number[]): string {
  return `vecf32([${v.map((x) => (Number.isFinite(x) ? x.toFixed(6) : "0")).join(",")}])`;
}
