// POST /api/users/[id]/ask — Body: AskRequest. GraphRAG Q&A: every answer line cites a real path (lib/agents/ask).
import { ask } from "@/lib/agents/ask";
import { error, handle, json } from "@/lib/http";
import type { AskRequest, AskResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => {
  const body = (await req.json().catch(() => null)) as AskRequest | null;
  if (!body?.confId || !body.question?.trim()) return error("confId and question are required");
  return json<AskResponse>(await ask(params.id, body.confId, body.question.trim()));
});
