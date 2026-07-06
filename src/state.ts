/**
 * The graph's shared state.
 *
 * In LangGraph, every node reads this object and returns a PARTIAL update
 * to it. `Annotation.Root` declares the shape; each field is a "channel".
 * A node returning `{ draft: "..." }` updates only that channel; unset
 * channels keep their previous value.
 */
import { Annotation } from "@langchain/langgraph";
import type { Issue } from "./github";
import type { Classification } from "./classify";

export const TriageState = Annotation.Root({
  // Inputs
  issue: Annotation<Issue>,

  // Filled by the classify node
  classification: Annotation<Classification | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),

  // Filled by a specialist draft node
  draft: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => "",
  }),

  // Filled by the guard node: did the draft pass quality review?
  guardApproved: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => false,
  }),
  guardFeedback: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => "",
  }),

  // How many times we've redrafted. Bounds the redraft loop.
  redraftCount: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),

  // Final outcome
  status: Annotation<"pending" | "auto-finalized" | "human-approved" | "human-rejected">({
    reducer: (_prev, next) => next,
    default: () => "pending",
  }),
});

export type TriageStateType = typeof TriageState.State;

// If confidence is below this, the graph interrupts for human approval
// instead of auto-finalizing. Overridable via env for testing/tuning.
export const CONFIDENCE_GATE = Number(process.env.CONFIDENCE_GATE ?? "0.75");

// Never redraft more than this many times — bounds the guard loop.
export const MAX_REDRAFTS = 2;
