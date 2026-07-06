/**
 * The graph's nodes. Each node is a function: (state) => partial state update.
 *
 * A node does its work, then RETURNS an object with only the channels it
 * changed. LangGraph merges that into the shared state and moves to the
 * next node per the edges defined in graph.ts.
 */
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatAnthropic } from "@langchain/anthropic";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { z } from "zod";
import { classifyIssue } from "./classify";
import type { TriageStateType } from "./state";
import { MAX_REDRAFTS } from "./state";

const model = new ChatAnthropic({
  model: "claude-sonnet-4-5",
  temperature: 0.3,
  maxTokens: 600,
});

// ── Node: classify ───────────────────────────────────────────────────
// Reuses the LangChain chain from classify.ts. Writes classification.
export async function classifyNode(
  state: TriageStateType,
): Promise<Partial<TriageStateType>> {
  const classification = await classifyIssue(state.issue);
  return { classification };
}

// ── Specialist draft nodes ───────────────────────────────────────────
// One per category. The conditional edge (graph.ts) routes to exactly one.
// Each writes `draft`. Guard feedback, if any, is folded into the prompt.
function draftPromptFor(role: string) {
  return ChatPromptTemplate.fromMessages([
    ["system", role],
    [
      "human",
      [
        "Issue title: {title}",
        "Issue body: {body}",
        "{feedback}",
        "Write a concise, friendly maintainer reply. Plain text only.",
      ].join("\n"),
    ],
  ]);
}

function makeDraftNode(role: string) {
  const chain = draftPromptFor(role).pipe(model).pipe(new StringOutputParser());
  return async (state: TriageStateType): Promise<Partial<TriageStateType>> => {
    const draft = await chain.invoke({
      title: state.issue.title,
      body: state.issue.body || "(empty)",
      feedback: state.guardFeedback
        ? `A reviewer rejected the previous draft with this feedback, address it: ${state.guardFeedback}`
        : "",
    });
    return { draft, redraftCount: state.redraftCount + 1 };
  };
}

export const draftBugNode = makeDraftNode(
  "You are a maintainer replying to a BUG report. Ask for a minimal repro, version, and environment if missing. Be specific.",
);
export const draftFeatureNode = makeDraftNode(
  "You are a maintainer replying to a FEATURE request. Acknowledge the use case, ask about alternatives considered, set expectations on scope.",
);
export const draftDocsNode = makeDraftNode(
  "You are a maintainer replying to a DOCS issue. Point to where the docs should change and invite a PR.",
);
export const draftQuestionNode = makeDraftNode(
  "You are a maintainer replying to a usage QUESTION. Answer directly if possible, or point to the right resource.",
);

// ── Node: guard ──────────────────────────────────────────────────────
// A cheap LLM-as-judge that quality-checks the draft. If it fails, the
// graph loops back to redraft (bounded by MAX_REDRAFTS).
const GuardVerdict = z.object({
  approved: z.boolean().describe("Is the draft reply good enough to send?"),
  feedback: z
    .string()
    .describe("If not approved, one sentence on what to fix. Empty if approved."),
});

const guardChain = ChatPromptTemplate
  .fromTemplate(
    [
      "You review draft maintainer replies for quality.",
      "Approve only if the reply is on-topic, actionable, and professional.",
      "Draft reply:\n{draft}",
    ].join("\n"),
  )
  .pipe(model.withStructuredOutput(GuardVerdict, { name: "guard" }));

export async function guardNode(
  state: TriageStateType,
): Promise<Partial<TriageStateType>> {
  // Out of redraft budget: force-approve so we don't loop forever.
  if (state.redraftCount > MAX_REDRAFTS) {
    return { guardApproved: true, guardFeedback: "" };
  }
  const verdict = await guardChain.invoke({ draft: state.draft });
  return { guardApproved: verdict.approved, guardFeedback: verdict.feedback };
}
