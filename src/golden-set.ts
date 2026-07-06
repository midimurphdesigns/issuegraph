/**
 * The golden set: labeled test issues with known-correct categories.
 *
 * This is the ground truth an eval scores against. Each example has an
 * input (what the graph receives) and a reference output (what we know
 * the right answer is). Small on purpose — a real golden set grows over
 * time as you find issues the model gets wrong.
 */
import type { Issue } from "./github";

export type GoldenExample = {
  input: Pick<Issue, "title" | "body" | "labels" | "owner" | "repo">;
  expectedCategory: "bug" | "feature" | "docs" | "question";
};

const stub = { owner: "acme", repo: "widget", labels: [] as string[] };

export const GOLDEN_SET: GoldenExample[] = [
  {
    input: {
      ...stub,
      title: "App crashes with TypeError when clicking Save",
      body: "Steps: open editor, click Save. Expected: saves. Actual: TypeError: cannot read 'id' of undefined. Version 2.1.0, Chrome 120.",
    },
    expectedCategory: "bug",
  },
  {
    input: {
      ...stub,
      title: "Add dark mode support",
      body: "Would love a dark theme for late-night work. Have you considered a system-preference toggle?",
    },
    expectedCategory: "feature",
  },
  {
    input: {
      ...stub,
      title: "README install steps are out of date",
      body: "The install section still references npm install but the project moved to pnpm. The commands fail as written.",
    },
    expectedCategory: "docs",
  },
  {
    input: {
      ...stub,
      title: "How do I configure a custom timeout?",
      body: "I can't find where to set the request timeout. Is there a config option or env var for this?",
    },
    expectedCategory: "question",
  },
  {
    input: {
      ...stub,
      title: "Memory leak in worker pool under load",
      body: "Under sustained load, RSS grows unbounded and never releases. Heap snapshot attached shows retained closures. Expected stable memory.",
    },
    expectedCategory: "bug",
  },
  {
    input: {
      ...stub,
      title: "Support exporting reports to CSV",
      body: "Right now reports only export to PDF. A CSV export would let us pipe data into spreadsheets. Alternative considered: manual copy-paste, too slow.",
    },
    expectedCategory: "feature",
  },
  {
    input: {
      ...stub,
      title: "Docs missing example for the retry option",
      body: "The API reference lists a `retry` option but there's no example showing how to use it. Could you add one?",
    },
    expectedCategory: "docs",
  },
  {
    input: {
      ...stub,
      title: "Is this library compatible with Node 22?",
      body: "Thinking of upgrading our runtime. Does the current version support Node 22, or should I wait?",
    },
    expectedCategory: "question",
  },
];
