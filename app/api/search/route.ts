// GET /api/search — ?confId=&q=
// STUB: returns mocks until the real handler lands (see GitHub issues).
import * as mocks from "@/mocks";
import { json } from "@/lib/http";
import type { SearchResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return json<SearchResponse>(mocks.search);
}
