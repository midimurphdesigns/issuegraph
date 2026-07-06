/**
 * POST /api/triage  { presetId: string }
 *
 * Starts a graph run for one of the curated preset issues and streams
 * node-by-node progress as Server-Sent Events. Preset-only by design:
 * arbitrary input on a public LLM endpoint invites prompt injection and
 * unbounded spend.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { getPreset } from "@/demo/presets";
import { checkLimits } from "@/demo/ratelimit";
import { sseResponse, streamGraphRun } from "@/demo/stream-run";

export const maxDuration = 120;

const Body = z.object({
  presetId: z.string().min(1).max(64),
  requireApproval: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limit = await checkLimits(ip);
  if (!limit.ok) {
    return Response.json({ error: limit.message }, { status: limit.status });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const preset = getPreset(parsed.data.presetId);
  if (!preset) {
    return Response.json({ error: "Unknown preset" }, { status: 404 });
  }

  const threadId = `demo-${preset.id}-${crypto.randomUUID()}`;
  return sseResponse((emit) =>
    streamGraphRun(
      emit,
      threadId,
      {
        issue: preset.issue,
        requireApproval: parsed.data.requireApproval,
      },
      preset.id,
    ),
  );
}
