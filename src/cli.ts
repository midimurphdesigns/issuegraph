/**
 * CLI entry. Chunk 1 version: fetch → classify → print.
 * The LangGraph pipeline replaces the internals in Chunk 2.
 *
 * Run: pnpm triage https://github.com/<owner>/<repo>/issues/<n>
 */
import "dotenv/config";
import { fetchIssue } from "./github.js";
import { classifyIssue } from "./classify.js";

const url = process.argv[2];
if (!url) {
  console.error("Usage: pnpm triage <github-issue-url>");
  process.exit(1);
}

const issue = await fetchIssue(url);
console.log(`\n${issue.owner}/${issue.repo}#${issue.number} — ${issue.title}\n`);

const result = await classifyIssue(issue);
console.log(`category:   ${result.category}`);
console.log(`confidence: ${result.confidence}`);
console.log(`reasoning:  ${result.reasoning}`);
