/**
 * Shared streaming runner for the demo API.
 *
 * Runs (or resumes) the triage graph and emits Server-Sent Events the UI
 * can animate: one `node` event per graph step, then either `interrupt`
 * (graph paused at the confidence gate) or `done` (final state).
 */
import { Command } from "@langchain/langgraph";
import { builder } from "../graph";
import { getCheckpointer } from "./checkpointer";
import type { Issue } from "../github";
import type { TriageStateType } from "../state";

export type SseEvent =
  | { type: "node"; node: string; update: Record<string, unknown> }
  | {
      type: "interrupt";
      threadId: string;
      payload: { reason: string; confidence: number; category?: string; draft: string };
    }
  | { type: "done"; result: FinalResult }
  | { type: "error"; message: string };

export type FinalResult = {
  category?: string;
  confidence?: number;
  status: string;
  redrafts: number;
  draft: string;
};

function finalize(values: TriageStateType): FinalResult {
  return {
    category: values.classification?.category,
    confidence: values.classification?.confidence,
    status: values.status,
    redrafts: values.redraftCount,
    draft: values.draft,
  };
}

export function sseResponse(
  run: (emit: (e: SseEvent) => void) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: SseEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      };
      try {
        await run(emit);
      } catch (err) {
        // Log the real error server-side; never ship internals (API error
        // bodies, key hints, stack fragments) to the public client.
        console.error("[issuegraph] run failed:", err);
        const message =
          process.env.NODE_ENV === "production"
            ? "The run failed. Try again in a moment."
            : err instanceof Error
              ? err.message
              : "unknown error";
        emit({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

/**
 * Stream a graph run. `input` is either the initial state (new run) or a
 * Command (resume). Emits node events as the graph executes, then detects
 * whether the run finished or paused at an interrupt.
 */
export async function streamGraphRun(
  emit: (e: SseEvent) => void,
  threadId: string,
  input: { issue: Issue } | InstanceType<typeof Command>,
): Promise<void> {
  const checkpointer = await getCheckpointer();
  const graph = builder.compile({ checkpointer });
  const config = { configurable: { thread_id: threadId } };

  // streamMode "updates" yields one object per executed node:
  //   { nodeName: { ...channels that node wrote } }
  // The cast aligns our union with the graph's own generically-typed
  // input parameter (its Command generic is bound to this graph's node names).
  const stream = await graph.stream(
    input as Parameters<typeof graph.stream>[0],
    { ...config, streamMode: "updates" },
  );

  for await (const chunk of stream) {
    for (const [node, update] of Object.entries(
      chunk as Record<string, Record<string, unknown>>,
    )) {
      if (node === "__interrupt__") continue; // handled below via getState
      emit({ type: "node", node, update: sanitizeUpdate(update) });
    }
  }

  // Stream ended: either the graph completed or paused at interrupt().
  const state = await graph.getState(config);
  const pending = state.tasks?.flatMap((t) => t.interrupts ?? []) ?? [];

  if (pending.length > 0) {
    const value = pending[0]!.value as {
      reason: string;
      confidence: number;
      category?: string;
      draft: string;
    };
    emit({ type: "interrupt", threadId, payload: value });
    return;
  }

  emit({ type: "done", result: finalize(state.values as TriageStateType) });
}

// Trim the update payload to what the UI needs — never ship the whole
// issue body or internal fields back over the wire.
function sanitizeUpdate(update: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if ("classification" in update) out.classification = update.classification;
  if ("draft" in update && typeof update.draft === "string") {
    out.draft = update.draft;
  }
  if ("guardApproved" in update) out.guardApproved = update.guardApproved;
  if ("guardFeedback" in update) out.guardFeedback = update.guardFeedback;
  if ("redraftCount" in update) out.redraftCount = update.redraftCount;
  if ("status" in update) out.status = update.status;
  return out;
}
