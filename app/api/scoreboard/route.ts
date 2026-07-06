/**
 * GET /api/scoreboard
 *
 * Returns the live eval scoreboard: per-preset run counts, accuracy, and
 * mean confidence accumulated from real visitor runs. Read-only, no model
 * call, so it is cheap to poll and safe to hit often.
 */
import { readScoreboard } from "@/demo/scoreboard";

export const dynamic = "force-dynamic";

export async function GET() {
  const board = await readScoreboard();
  return Response.json(board, {
    headers: { "Cache-Control": "no-store" },
  });
}
