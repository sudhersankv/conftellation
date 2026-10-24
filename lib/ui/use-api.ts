"use client";
// Stale-while-revalidate fetch hook with a module-level cache. Key convention: `<api method>:<args in call order>`
// so screens sharing data share one fetch. Show ErrorState only when `error && !data`.
import { useCallback, useEffect, useReducer, useRef, useState } from "react";

export const apiKey = (...parts: (string | undefined | null)[]) => parts.map((p) => p ?? "").join(":");

const cache = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();
const subs = new Map<string, Set<() => void>>();
const notify = (k: string) => subs.get(k)?.forEach((f) => f());

function load<T>(k: string, f: () => Promise<T>) {
  let p = inflight.get(k) as Promise<T> | undefined;
  if (!p) {
    p = f().then((d) => { cache.set(k, d); notify(k); return d; }).finally(() => inflight.delete(k));
    inflight.set(k, p);
  }
  return p;
}

export function useApi<T>(key: string | null, fetcher: () => Promise<T>, opts: { pollMs?: number } = {}) {
  const fetcherRef = useRef(fetcher); fetcherRef.current = fetcher;
  const keyRef = useRef(key); keyRef.current = key;
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    if (!key) return;
    let s = subs.get(key);
    if (!s) subs.set(key, (s = new Set()));
    s.add(rerender);
    return () => { s!.delete(rerender); };
  }, [key]);
  const reload = useCallback(async () => {
    if (!key) return;
    setFetching(true);
    try { await load(key, () => fetcherRef.current()); if (keyRef.current === key) setError(null); }
    catch (e) { if (keyRef.current === key) setError(e instanceof Error ? e : new Error(String(e))); }
    finally { if (keyRef.current === key) setFetching(false); }
  }, [key]);
  useEffect(() => { setError(null); void reload(); }, [reload]);
  useEffect(() => {
    if (!key || !opts.pollMs) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") void reload(); }, opts.pollMs);
    return () => clearInterval(t);
  }, [key, opts.pollMs, reload]);
  const mutate = useCallback((next: T) => { if (!key) return; cache.set(key, next); notify(key); }, [key]);
  const data = key ? (cache.get(key) as T | undefined) : undefined;
  return { data, error, loading: fetching && data === undefined, reload, mutate };
}
