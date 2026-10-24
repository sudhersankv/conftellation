"use client";
// Demo user + conference + demo clock. `now()` is the demo clock; pass `nowIso()` to api.plan(…, { now }) / api.feedback(…, { now }).
// `?as=<userId>` is handled by middleware.ts, `?now=<ISO>` (sticky per tab, `?now=off` clears) is read here.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export const DEMO_USERS: Record<string, string> = { sam: "Sam Rivera", emily: "Emily Chen" };
export const userName = (id: string) => DEMO_USERS[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
export const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

const ID = /^[a-z0-9-]{1,80}$/i;
const NOW_KEY = "ptc_now";
const writeCookie = (k: string, v: string) => { document.cookie = `${k}=${encodeURIComponent(v)}; path=/; max-age=31536000; samesite=lax`; };

interface Session {
  userId: string;
  confId: string;
  setUserId(id: string): void;
  setConfId(id: string): void;
  now(): Date;
  nowIso(): string | undefined;
  otherUserId: string;
}

const Ctx = createContext<Session>({
  userId: "sam", confId: "ptc-2026", setUserId() {}, setConfId() {},
  now: () => new Date(), nowIso: () => undefined, otherUserId: "emily",
});

export function SessionProvider({ initialUserId, initialConfId, children }: { initialUserId?: string; initialConfId?: string; children: ReactNode }) {
  const [userId, setU] = useState(initialUserId && ID.test(initialUserId) ? initialUserId : "sam");
  const [confId, setC] = useState(initialConfId && ID.test(initialConfId) ? initialConfId : "ptc-2026");
  const [nowOverride, setNowOverride] = useState<string | undefined>();
  useEffect(() => {
    try {
      const raw = new URLSearchParams(window.location.search).get("now");
      if (raw === "off" || raw === "") { sessionStorage.removeItem(NOW_KEY); return; }
      const v = raw?.replace(/ /g, "+"); // a literal "+07:00" arrives as a space
      if (v && !Number.isNaN(Date.parse(v))) { sessionStorage.setItem(NOW_KEY, v); setNowOverride(v); return; }
      const saved = sessionStorage.getItem(NOW_KEY);
      if (saved) setNowOverride(saved);
    } catch { /* storage blocked */ }
  }, []);
  const setUserId = useCallback((id: string) => { if (!ID.test(id)) return; writeCookie("ptc_user", id); setU(id); }, []);
  const setConfId = useCallback((id: string) => { if (!ID.test(id)) return; writeCookie("ptc_conf", id); setC(id); }, []);
  const value = useMemo<Session>(() => ({
    userId, confId, setUserId, setConfId,
    otherUserId: userId === "emily" ? "sam" : "emily",
    now: () => (nowOverride ? new Date(nowOverride) : new Date()),
    nowIso: () => nowOverride,
  }), [userId, confId, setUserId, setConfId, nowOverride]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
