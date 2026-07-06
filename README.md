# issuegraph

A GitHub issue triage agent built on **LangGraph**, traced and evaluated with **LangSmith**.

**Live demo: [issuegraph.kevinmurphywebdev.com](https://issuegraph.kevinmurphywebdev.com)** — runs the real graph server-side and streams each node to the page as it executes. The ambiguous preset usually trips the confidence gate, pauses the graph mid-run, and waits for you to approve or reject the draft.

Feed it a public GitHub issue URL. A state graph classifies the issue, routes it to a specialist draft node, quality-checks the draft in a bounded loop, then applies a confidence gate: high-confidence results finalize automatically while low-confidence results pause the graph and wait for human approval.

## How it works

```mermaid
flowchart TD
    START([issue in]) --> C["classify<br/>(category + confidence)"]
    C --> RB{route by<br/>category}
    RB -->|bug| DB[draftBug]
    RB -->|feature| DF[draftFeature]
    RB -->|docs| DD[draftDocs]
    RB -->|question| DQ[draftQuestion]
    DB --> G["guard<br/>(LLM judge: good enough?)"]
    DF --> G
    DD --> G
    DQ --> G
    G -->|approved| GATE{confidence<br/>gate}
    G -->|rejected| RB
    GATE -->|confident| FIN([auto-finalize])
    GATE -->|low confidence| INT["interrupt: pause,<br/>wait for human"]
    INT --> HUMAN([human approves<br/>or rejects])
```

The pieces map one-to-one onto LangGraph concepts:

| Concept | Where |
|---|---|
| Shared state (channels + reducers) | [`src/state.ts`](src/state.ts) |
| Nodes (classify, four specialist drafters, guard) | [`src/nodes.ts`](src/nodes.ts) |
| Conditional edges (category routing, guard retry loop) | [`src/graph.ts`](src/graph.ts) |
| Human-in-the-loop (`interrupt()` + `Command({ resume })`) | [`src/graph.ts`](src/graph.ts) |
| LangChain classifier chain (prompt piped into structured output) | [`src/classify.ts`](src/classify.ts) |

The classifier and guard force structured output through Zod schemas, so every LLM boundary returns typed, validated data. The redraft loop is bounded (`MAX_REDRAFTS`) and the confidence gate threshold is configurable (`CONFIDENCE_GATE` env var, default 0.75).

## Evals

The eval suite ([`src/run-evals.ts`](src/run-evals.ts)) uploads a labeled golden set to LangSmith, runs the full graph over every example with `evaluate()`, and scores each result two ways:

- **`category_accuracy`**: deterministic exact match against the labeled category.
- **`draft_quality`**: LLM-as-judge grading of the drafted reply, since free-form text has no single correct answer.

It then computes a **calibration report** from the classifier's stated confidences: a Brier score plus a reliability table comparing claimed confidence against actual accuracy per bucket ([`src/calibration.ts`](src/calibration.ts)). Confidence numbers from a model are claims, not facts. Calibration is how you check the claims.

```
── CALIBRATION REPORT ──────────────────────────────────
samples:      8
Brier score:  0.003  (0 = perfect, 0.25 = coin flip)

reliability by confidence bucket:
  bucket      n   claimed  actual   verdict
  0.9-1.0     8   0.95     1.00    calibrated
```

## Stack

- [`@langchain/langgraph`](https://github.com/langchain-ai/langgraphjs): the state machine (nodes, conditional edges, cycles, checkpointing, interrupts)
- [`@langchain/anthropic`](https://github.com/langchain-ai/langchainjs): Claude powers the classifier, drafters, guard, and judge
- [`langsmith`](https://github.com/langchain-ai/langsmith-sdk): tracing, datasets, offline evals
- TypeScript strict, Zod at every LLM boundary, Vitest

## Setup

```sh
pnpm install
cp .env.example .env   # ANTHROPIC_API_KEY + LANGSMITH_API_KEY
npx tsx src/hello-trace.ts   # smoke test: one traced model call
```

## Usage

```sh
pnpm triage <github-issue-url>   # triage one issue end-to-end (CLI)
pnpm eval                        # golden set + calibration report
pnpm test                        # unit tests
pnpm dev                         # the demo UI on localhost:3006
```

## Demo architecture notes

The web demo triages curated preset issues only. Arbitrary input on a public LLM endpoint invites prompt injection and unbounded spend, so the input surface is a fixed allowlist, rate-limited per IP with a global daily budget (Upstash, fail-closed in production).

`interrupt()` requires checkpoints that survive between the pause request and the resume request. Serverless instances do not share memory, so the demo uses a Redis checkpointer in production and falls back to an in-memory saver for local dev. The TCP connection string is derived automatically from `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (the same pair the rate limiter uses); set `REDIS_URL` only if you want to point the checkpointer somewhere else.

### Spend + abuse guardrails

- Preset allowlist: no user-controlled text ever reaches a prompt, closing off prompt injection and SSRF.
- Per-IP sliding window (10 runs/hour) plus a global daily budget (default 75 runs, `DEMO_DAILY_LIMIT`), both fail-closed when Upstash is unconfigured in production. At worst-case token usage 75 runs costs roughly $3/day.
- Resume requests make no model call (the gate node is pure logic) so they are IP-limited but exempt from the daily budget.
- `maxTokens` on every model call, the redraft loop is bounded, and graph recursion is capped by LangGraph's default limit.
- Thread ids are UUIDs and checkpoints expire after an hour, so paused runs cannot be enumerated or hoarded.
- Production error events are generic; real errors stay in server logs.

MIT
