# issuegraph

A GitHub issue triage agent built on **LangGraph**, traced and evaluated with **LangSmith**.

Feed it a public GitHub issue URL. A state graph classifies the issue (bug / feature / docs / question) with a confidence score, routes it to a specialist draft node via conditional edges, quality-checks the draft with a guard node (with a bounded redraft cycle), then hits a confidence gate: high-confidence results finalize automatically, low-confidence results interrupt the graph and wait for human approval.

The eval suite runs a golden set of labeled issues through the graph, grades classification accuracy and draft quality (LLM-as-judge), and produces a **calibration report**: Brier score plus a reliability table comparing stated confidence against actual accuracy.

## Stack

- [`@langchain/langgraph`](https://github.com/langchain-ai/langgraphjs) — the state machine (nodes, conditional edges, cycles, checkpointing, human-in-the-loop interrupts)
- [`@langchain/anthropic`](https://github.com/langchain-ai/langchainjs) — Claude powers the classifier and draft nodes
- [`langsmith`](https://github.com/langchain-ai/langsmith-sdk) — tracing, datasets, offline evals
- TypeScript strict, Zod schemas at every LLM boundary

## Setup

```sh
pnpm install
cp .env.example .env   # fill in ANTHROPIC_API_KEY + LANGSMITH_API_KEY
npx tsx src/hello-trace.ts   # smoke test: one traced model call
```

## Usage

```sh
pnpm triage <github-issue-url>   # triage one issue end-to-end
pnpm eval                        # run the golden set + calibration report
```

## Status

Work in progress — built as a learning project to go deep on the LangChain ecosystem. Architecture notes and diagrams landing with v0.1.

MIT
