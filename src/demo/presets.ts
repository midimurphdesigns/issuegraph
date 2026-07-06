/**
 * Curated demo issues. The public demo only triages these presets:
 * arbitrary input on a public LLM endpoint invites prompt injection and
 * unbounded spend, so the input surface is a fixed allowlist.
 */
import type { Issue } from "../github";

export type Category = "bug" | "feature" | "docs" | "question";

export type Preset = {
  id: string;
  label: string;
  hint: string;
  /**
   * The category a maintainer would assign. Makes every preset run a
   * labeled outcome, so the live scoreboard can score real visitor runs.
   * `slow-after-update` is genuinely ambiguous, hence null: it exists to
   * trip the confidence gate, not to be graded for accuracy.
   */
  expected: Category | null;
  issue: Issue;
};

const base = { url: "", owner: "acme", repo: "widget", number: 0, labels: [] as string[] };

export const PRESETS: Preset[] = [
  {
    id: "crash-on-save",
    label: "Crash on save",
    hint: "a clear bug report",
    expected: "bug",
    issue: {
      ...base,
      title: "App crashes with TypeError when clicking Save",
      body: "Steps: open the editor, make any change, click Save. Expected: document saves. Actual: crash with TypeError: cannot read 'id' of undefined in editor.js:214. Reproduces every time on v2.1.0, Chrome 120, macOS.",
    },
  },
  {
    id: "dark-mode",
    label: "Dark mode request",
    hint: "a feature request",
    expected: "feature",
    issue: {
      ...base,
      title: "Add dark mode support",
      body: "Would love a dark theme for late-night work. Ideally it follows the system preference with a manual toggle as an override. Happy to help test a beta.",
    },
  },
  {
    id: "stale-readme",
    label: "Outdated install docs",
    hint: "a docs fix",
    expected: "docs",
    issue: {
      ...base,
      title: "README install steps are out of date",
      body: "The install section still says npm install but the project moved to pnpm last release. Following the README as written fails on the postinstall step.",
    },
  },
  {
    id: "timeout-config",
    label: "Timeout question",
    hint: "a usage question",
    expected: "question",
    issue: {
      ...base,
      title: "How do I configure a custom request timeout?",
      body: "I can't find where to set the request timeout. Is there a config option or an environment variable for this? The docs mention retries but not timeouts.",
    },
  },
  {
    id: "slow-after-update",
    label: "Slow after update",
    hint: "ambiguous: bug or question? often trips the confidence gate",
    expected: null,
    issue: {
      ...base,
      title: "Everything feels slower after updating",
      body: "Since the last update things feel generally slower, especially at startup, but sometimes it is fine. Not sure if something is wrong on my machine or if this is expected with the new version. Anyone else seeing this?",
    },
  },
];

export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}
