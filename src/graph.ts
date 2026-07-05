/**
 * The graph: nodes wired together with edges.
 *
 * Flow:
 *   classify → (route by category) → draftX → guard → (approved?)
 *        approved   → gate → (confident? auto-finalize : interrupt for human)
 *        rejected   → back to draftX  (bounded by MAX_REDRAFTS)
 *
 * This is what a straight `.pipe()` can't express: a branch (route by
 * category), a loop (redraft), and a pause (human approval).
 */
import { StateGraph, START, END, interrupt, Command } from "@langchain/langgraph";
import {
  TriageState,
  type TriageStateType,
  CONFIDENCE_GATE,
} from "./state.js";
import {
  classifyNode,
  draftBugNode,
  draftFeatureNode,
  draftDocsNode,
  draftQuestionNode,
  guardNode,
} from "./nodes.js";

// ── Conditional edge: pick the specialist draft node by category ──────
function routeByCategory(state: TriageStateType): string {
  switch (state.classification?.category) {
    case "bug":
      return "draftBug";
    case "feature":
      return "draftFeature";
    case "docs":
      return "draftDocs";
    default:
      return "draftQuestion";
  }
}

// ── Conditional edge: after the guard, loop back or move on ───────────
function afterGuard(state: TriageStateType): string {
  if (state.guardApproved) return "gate";
  // rejected → redraft the SAME category
  return routeByCategory(state);
}

// ── Node: the confidence gate + human-in-the-loop interrupt ───────────
// High confidence → finalize automatically.
// Low confidence  → interrupt(): pause the graph, surface the draft to a
// human, and wait. The human resumes with true (approve) or false (reject).
function gateNode(state: TriageStateType): Partial<TriageStateType> {
  const confidence = state.classification?.confidence ?? 0;

  if (confidence >= CONFIDENCE_GATE) {
    return { status: "auto-finalized" };
  }

  // Below the gate: pause and ask a human. Everything passed to interrupt()
  // is surfaced to whoever is driving the graph. The resumed value is an
  // object ({ approved: boolean }) — never a bare boolean, because a falsy
  // resume value trips LangGraph's EmptyInputError.
  const decision = interrupt({
    reason: "low confidence — human approval required",
    confidence,
    category: state.classification?.category,
    draft: state.draft,
  }) as { approved: boolean };

  return { status: decision.approved ? "human-approved" : "human-rejected" };
}

// ── Build the graph ───────────────────────────────────────────────────
const builder = new StateGraph(TriageState)
  .addNode("classify", classifyNode)
  .addNode("draftBug", draftBugNode)
  .addNode("draftFeature", draftFeatureNode)
  .addNode("draftDocs", draftDocsNode)
  .addNode("draftQuestion", draftQuestionNode)
  .addNode("guard", guardNode)
  .addNode("gate", gateNode)
  .addEdge(START, "classify")
  // classify → one of the four draft nodes
  .addConditionalEdges("classify", routeByCategory, {
    draftBug: "draftBug",
    draftFeature: "draftFeature",
    draftDocs: "draftDocs",
    draftQuestion: "draftQuestion",
  })
  // every draft node → guard
  .addEdge("draftBug", "guard")
  .addEdge("draftFeature", "guard")
  .addEdge("draftDocs", "guard")
  .addEdge("draftQuestion", "guard")
  // guard → gate (approved) or back to a draft node (rejected)
  .addConditionalEdges("guard", afterGuard, {
    gate: "gate",
    draftBug: "draftBug",
    draftFeature: "draftFeature",
    draftDocs: "draftDocs",
    draftQuestion: "draftQuestion",
  })
  .addEdge("gate", END);

// Note: no checkpointer bound here — cli.ts compiles with one, because
// `interrupt()` requires a checkpointer to save/resume the paused state.
export { builder, Command };
