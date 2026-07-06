/**
 * POST /api/resume  { threadId: string, approved: boolean }
 *
 * Resumes a graph paused at the confidence-gate interrupt with the
 * human's decision, streaming the remaining steps as SSE.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { Command } from "@langchain/langgraph";
import { checkLimits } from "@/demo/ratelimit";
import { sseResponse, streamGraphRun } from "@/demo/stream-run";

export const maxDuration = 60;

const Body = z.object({
  threadId: z.string().startsWith("demo-").max(128),
  approved: z.boolean(),
});

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  // Resume runs no model call (the gate node is pure logic), so it is
  // per-IP limited but does not burn the daily LLM budget.
  const limit = await checkLimits(ip, { countsAgainstBudget: false });
  if (!limit.ok) {
    return Response.json({ error: limit.message }, { status: limit.status });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { threadId, approved } = parsed.data;
  // Resume value is an object on purpose: LangGraph treats a bare falsy
  // resume as "no input" and throws EmptyInputError.
  return sseResponse((emit) =>
    streamGraphRun(emit, threadId, new Command({ resume: { approved } })),
  );
}
