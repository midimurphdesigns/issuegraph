/**
 * The classifier: a LangChain chain composed with LCEL.
 *
 *   ChatPromptTemplate  →  ChatAnthropic.withStructuredOutput(zod schema)
 *
 * `.pipe()` composes Runnables — each step's output feeds the next step's
 * input, and the whole chain is itself a Runnable (invoke/stream/batch).
 * `withStructuredOutput` binds the Zod schema as a forced tool call, so the
 * model must return JSON matching the schema; the chain's return type is
 * the parsed, validated object — no manual JSON.parse.
 */
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatAnthropic } from "@langchain/anthropic";
import { z } from "zod";
import type { Issue } from "./github.js";

export const CATEGORIES = ["bug", "feature", "docs", "question"] as const;

export const ClassificationSchema = z.object({
  category: z.enum(CATEGORIES).describe("The single best-fit triage category"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "Probability (0-1) that the category is correct. Be honest: ambiguous issues deserve low numbers.",
    ),
  reasoning: z
    .string()
    .describe("One sentence explaining the call, citing the issue text"),
});

export type Classification = z.infer<typeof ClassificationSchema>;

const prompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    [
      "You triage GitHub issues for an open-source maintainer.",
      "Classify each issue into exactly one category:",
      "- bug: something is broken; expected vs actual behavior",
      "- feature: a request for new capability or an enhancement",
      "- docs: documentation is missing, wrong, or unclear",
      "- question: usage/support question with no code defect claimed",
      "Labels are hints from maintainers, not ground truth.",
    ].join("\n"),
  ],
  [
    "human",
    "Repo: {owner}/{repo}\nLabels: {labels}\nTitle: {title}\n\nBody:\n{body}",
  ],
]);

const model = new ChatAnthropic({
  model: "claude-sonnet-4-5",
  temperature: 0,
  maxTokens: 300,
});

export const classifierChain = prompt.pipe(
  model.withStructuredOutput(ClassificationSchema, { name: "classify_issue" }),
);

export async function classifyIssue(issue: Issue): Promise<Classification> {
  return classifierChain.invoke({
    owner: issue.owner,
    repo: issue.repo,
    labels: issue.labels.join(", ") || "(none)",
    title: issue.title,
    body: issue.body || "(empty)",
  });
}
