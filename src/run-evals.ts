/**
 * Chunk 3 — the eval runner. What it does, top to bottom:
 *
 *   1. Ensure a LangSmith dataset exists, seeded from the golden set.
 *   2. Run the triage graph over every example via LangSmith `evaluate()`.
 *   3. Score each result with two evaluators (category match + LLM judge).
 *   4. Compute a calibration report from the classification confidences.
 *
 * Run: pnpm eval
 */
import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { evaluate } from "langsmith/evaluation";
import { Client } from "langsmith";
import { MemorySaver } from "@langchain/langgraph";
import { builder } from "./graph";
import { GOLDEN_SET } from "./golden-set";
import { categoryAccuracy, draftQuality } from "./evaluators";
import {
  brierScore,
  printCalibrationReport,
  reliabilityBuckets,
  type Sample,
} from "./calibration";
import type { Issue } from "./github";

const DATASET_NAME = "issuegraph-golden";
const client = new Client();

// ── Step 1: create the dataset once, seed it from the golden set ──────
async function ensureDataset(): Promise<void> {
  if (await client.hasDataset({ datasetName: DATASET_NAME })) return;
  const dataset = await client.createDataset(DATASET_NAME, {
    description: "Labeled GitHub issues for triage classification evals",
  });
  for (const ex of GOLDEN_SET) {
    await client.createExample({
      inputs: ex.input,
      outputs: { expectedCategory: ex.expectedCategory },
      dataset_id: dataset.id,
    });
  }
  console.log(`seeded dataset '${DATASET_NAME}' with ${GOLDEN_SET.length} examples`);
}

// ── Step 2: the target — run the graph on one example's input ─────────
// evaluate() calls this for every example; its return becomes run.outputs,
// which the evaluators then score.
async function target(inputs: Record<string, unknown>) {
  const graph = builder.compile({ checkpointer: new MemorySaver() });
  const issue = {
    ...(inputs as Pick<Issue, "title" | "body" | "labels" | "owner" | "repo">),
    url: "",
    number: 0,
  } as Issue;

  const result = await graph.invoke(
    { issue },
    { configurable: { thread_id: `eval-${issue.title.slice(0, 20)}-${issue.body.length}` } },
  );
  return {
    category: result.classification?.category,
    confidence: result.classification?.confidence ?? 0,
    draft: result.draft,
    status: result.status,
  };
}

async function main() {
  await ensureDataset();

  console.log("running evaluation over the golden set...");
  const experiment = await evaluate(target, {
    data: DATASET_NAME,
    evaluators: [categoryAccuracy, draftQuality],
    experimentPrefix: "issuegraph",
    maxConcurrency: 4,
  });

  // ── Step 4: build calibration samples from the results ──────────────
  // For each example: the confidence the classifier claimed, and whether
  // the category was actually right (from the category_accuracy evaluator).
  const samples: Sample[] = [];
  for (const r of experiment.results) {
    const confidence = (r.run.outputs?.confidence as number) ?? 0;
    const accEval = r.evaluationResults.results.find(
      (e) => e.key === "category_accuracy",
    );
    const correct = Number(accEval?.score ?? 0) >= 1 ? 1 : 0;
    samples.push({ confidence, correct: correct as 0 | 1 });
  }

  printCalibrationReport(samples);

  // Snapshot for the demo UI: real numbers from this run, committed to
  // public/ so the deployed page shows actual eval output.
  const accuracy =
    samples.reduce((s, x) => s + x.correct, 0) / Math.max(samples.length, 1);
  const judgeScores = experiment.results.map(
    (r) =>
      Number(
        r.evaluationResults.results.find((e) => e.key === "draft_quality")
          ?.score ?? 0,
      ),
  );
  const draftPassRate =
    judgeScores.reduce((s, x) => s + x, 0) / Math.max(judgeScores.length, 1);

  const snapshot = {
    generatedAt: new Date().toISOString(),
    examples: samples.length,
    categoryAccuracy: accuracy,
    draftQualityPassRate: draftPassRate,
    brierScore: brierScore(samples),
    reliability: reliabilityBuckets(samples),
  };
  await writeFile(
    "public/eval-snapshot.json",
    JSON.stringify(snapshot, null, 2) + "\n",
    "utf8",
  );
  console.log("\nwrote public/eval-snapshot.json for the demo UI");
  console.log(
    `full results + traces: https://smith.langchain.com (project 'issuegraph')`,
  );
}

main();
