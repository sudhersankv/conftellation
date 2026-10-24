"use client";
// Meet proposal helpers: resolve session titles and render "at …" text.
import { useMemo } from "react";
import type { MeetProposal, NetworkResponse } from "@/lib/types";
import { api } from "@/lib/client";
import { apiKey, useApi } from "@/lib/ui/use-api";
import { fmtDay, fmtRange } from "@/lib/ui/format";

export type SessionLookup = (id: string) => string | undefined;

/** Session id → title, from the network's shared items first, then the conference schedule (cached). */
export function useSessionLookup(confId: string, network?: NetworkResponse): SessionLookup {
  const conf = useApi(apiKey("conference", confId), () => api.conference(confId));
  return useMemo(() => {
    const m = new Map<string, string>();
    conf.data?.sessions.forEach((s) => m.set(s.id, s.title));
    network?.users.forEach((u) => u.shared.forEach((s) => m.set(s.id, s.title)));
    return (id: string) => m.get(id);
  }, [conf.data, network]);
}

export function proposalText(p: MeetProposal | undefined, lookup: SessionLookup): string | null {
  if (!p) return null;
  if (p.sessionId) return lookup(p.sessionId) ?? "a shared session";
  if (p.slot) return `${fmtDay(p.slot.from)}, ${fmtRange(p.slot.from, p.slot.to)}`;
  if (p.place) return p.place;
  return null;
}
