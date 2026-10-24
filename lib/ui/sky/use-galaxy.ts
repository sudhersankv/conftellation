"use client";
import { api } from "@/lib/client";
import type { ConstellationResponse } from "@/lib/types";
import { useSession } from "@/lib/ui/session-context";
import { apiKey, useApi } from "@/lib/ui/use-api";

export const galaxyKey = (userId: string) => apiKey("galaxy", userId);

/** Record plus one constellation per conference (for the home sky). */
export function useGalaxy() {
  const { userId } = useSession();
  return useApi(galaxyKey(userId), async () => {
    const record = await api.record(userId);
    const cons = await Promise.all(record.conferences.map((c) => api.constellation(userId, c.conference.id).catch(() => null)));
    const byConf: Record<string, ConstellationResponse | null> = {};
    record.conferences.forEach((c, i) => { byConf[c.conference.id] = cons[i]; });
    return { record, byConf };
  });
}
