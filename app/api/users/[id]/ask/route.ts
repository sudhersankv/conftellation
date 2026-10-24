// POST /api/users/[id]/ask — Body: AskRequest. STUB until lib/agents/ask lands: returns the mock.
import * as mocks from "@/mocks";
import { error, handle, json } from "@/lib/http";
import type { AskRequest, AskResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request) => {
  const body = (await req.json().catch(() => null)) as AskRequest | null;
  if (!body?.confId || !body.question?.trim()) return error("confId and question are required");
  return json<AskResponse>({ ...mocks.ask, question: body.question });
});
