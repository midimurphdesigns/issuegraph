/**
 * The two evaluators. An evaluator is a function that scores ONE output
 * against its reference answer. LangSmith runs each evaluator on every
 * example and aggregates the scores into an experiment.
 *
 * A `score` of 1 = pass, 0 = fail. `key` names the metric in the dashboard.
 */
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import type { Run, Example } from "langsmith";

// ── Evaluator 1: classification accuracy (exact match) ────────────────
// Did the graph's category equal the golden reference category?
export function categoryAccuracy(run: Run, example?: Example) {
  const predicted = run.outputs?.category as string | undefined;
  const expected = example?.outputs?.expectedCategory as string | undefined;
  return {
    key: "category_accuracy",
    score: predicted && predicted === expected ? 1 : 0,
    comment: `predicted=${predicted} expected=${expected}`,
  };
}

// ── Evaluator 2: draft quality (LLM-as-judge) ─────────────────────────
// A separate model call grades whether the drafted reply is good.
// This IS a real LLM-as-judge: it uses a model (your Anthropic key) to
// score another model's output.
const judgeModel = new ChatAnthropic({ model: "claude-sonnet-4-5", temperature: 0 });

const JudgeVerdict = z.object({
  helpful: z.boolean().describe("Is the reply on-topic, actionable, professional?"),
  reason: z.string().describe("One sentence why."),
});

const judgeChain = ChatPromptTemplate
  .fromTemplate(
    [
      "You grade draft maintainer replies to GitHub issues.",
      "Issue title: {title}",
      "Draft reply:\n{draft}",
      "Is this reply helpful, on-topic, and professional?",
    ].join("\n"),
  )
  .pipe(judgeModel.withStructuredOutput(JudgeVerdict, { name: "judge" }));

export async function draftQuality(run: Run, example?: Example) {
  const draft = run.outputs?.draft as string | undefined;
  const title = (example?.inputs?.title as string | undefined) ?? "";
  if (!draft) {
    return { key: "draft_quality", score: 0, comment: "no draft produced" };
  }
  const verdict = await judgeChain.invoke({ title, draft });
  return {
    key: "draft_quality",
    score: verdict.helpful ? 1 : 0,
    comment: verdict.reason,
  };
}
