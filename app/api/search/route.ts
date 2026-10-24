// GET /api/search — ?confId=&q= → people (name prefix + vector) first, then sessions and booths. q shorter than 2 chars → empty.
import * as mocks from "@/mocks";
import { error, handle, json, useMocks } from "@/lib/http";
import { search } from "@/lib/agents/people";
import type { SearchResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  if (useMocks()) return json<SearchResponse>(mocks.search);
  const url = new URL(req.url);
  const confId = url.searchParams.get("confId");
  if (!confId) return error("confId is required");
  return json<SearchResponse>(await search(confId, url.searchParams.get("q") ?? ""));
});
