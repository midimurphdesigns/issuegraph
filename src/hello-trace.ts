/**
 * Chunk 0 smoke test: proves ANTHROPIC_API_KEY works and that LangSmith
 * tracing is wired. With LANGSMITH_TRACING=true + LANGSMITH_API_KEY set,
 * every LangChain model call is traced automatically — no code changes.
 *
 * Run: npx tsx src/hello-trace.ts
 */
import "dotenv/config";
import { ChatAnthropic } from "@langchain/anthropic";

const model = new ChatAnthropic({
  model: "claude-sonnet-4-5",
  maxTokens: 50,
});

const res = await model.invoke(
  "Reply with exactly: issuegraph tracing is live",
);

console.log(res.content);
console.log(
  "\nNow open https://smith.langchain.com — project 'issuegraph' should show this run.",
);
