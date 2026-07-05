/**
 * CLI: fetch an issue, run it through the LangGraph triage graph.
 * If the graph interrupts (low confidence), prompt for human approval
 * on the terminal, then resume.
 *
 * Run: pnpm triage <github-issue-url>
 */
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { MemorySaver } from "@langchain/langgraph";
import { fetchIssue } from "./github.js";
import { builder, Command } from "./graph.js";

const url = process.argv[2];
if (!url) {
  console.error("Usage: pnpm triage <github-issue-url>");
  process.exit(1);
}

// A checkpointer is REQUIRED for interrupt() to work — it saves the paused
// state so the graph can resume from exactly where it stopped.
const graph = builder.compile({ checkpointer: new MemorySaver() });

// thread_id identifies this run's saved state. Reuse it to resume.
const config = { configurable: { thread_id: `issue-${Date.now()}` } };

const issue = await fetchIssue(url);
console.log(`\n${issue.owner}/${issue.repo}#${issue.number} — ${issue.title}\n`);

// Run until the graph finishes OR hits an interrupt.
let result = await graph.invoke({ issue }, config);

// If the graph paused, `__interrupt__` is present on the result.
const interrupts = (result as { __interrupt__?: Array<{ value: unknown }> })
  .__interrupt__;

if (interrupts?.length) {
  const payload = interrupts[0]!.value as {
    confidence: number;
    category: string;
    draft: string;
  };
  console.log("── HUMAN APPROVAL NEEDED ───────────────────────────────");
  console.log(`category:   ${payload.category}`);
  console.log(`confidence: ${payload.confidence} (below gate)`);
  console.log(`\ndraft reply:\n${payload.draft}\n`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question("Approve this draft? (y/n) ")).trim().toLowerCase();
  rl.close();

  // Resume the graph with the human's decision. Pass an OBJECT, not a bare
  // boolean — a falsy resume value trips LangGraph's EmptyInputError.
  result = await graph.invoke(
    new Command({ resume: { approved: answer === "y" } }),
    config,
  );
}

console.log("\n── RESULT ──────────────────────────────────────────────");
console.log(`category:   ${result.classification?.category}`);
console.log(`confidence: ${result.classification?.confidence}`);
console.log(`status:     ${result.status}`);
console.log(`redrafts:   ${result.redraftCount}`);
console.log(`\nfinal reply:\n${result.draft}`);
