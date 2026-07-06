/**
 * Live eval scoreboard over Upstash Redis.
 *
 * Every preset run a visitor triggers is a labeled outcome: the preset
 * carries the category a maintainer would assign, so comparing it to what
 * the classifier predicted is a real accuracy signal. We accumulate per
 * preset (runs, correct, summed confidence) and render a scoreboard that
 * grows as people use the demo. This is the offline golden-set eval turned
 * into a live one driven by real traffic.
 *
 * Redis layout (one hash per preset, no TTL — this is the running record):
 *   ig:score:{presetId}  { runs, correct, confidenceSum }
 *
 * The ambiguous preset (expected === null) still records runs and mean
 * confidence but is excluded from accuracy, because there is no single
 * right answer to score it against.
 */
import { Redis } from "@upstash/redis";
import { PRESETS, type Category } from "./presets";

const HAS_UPSTASH = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
);
const redis = HAS_UPSTASH ? Redis.fromEnv() : null;

const key = (presetId: string) => `ig:score:${presetId}`;

export type PresetScore = {
  id: string;
  label: string;
  expected: Category | null;
  runs: number;
  correct: number;
  accuracy: number | null; // null for the ambiguous preset
  meanConfidence: number | null;
};

export type Scoreboard = {
  perPreset: PresetScore[];
  totalRuns: number;
  overallAccuracy: number | null; // across scored presets only
  live: boolean; // false when Upstash is not configured
};

/**
 * Record one run. Fire-and-forget from the request path: a scoreboard
 * write must never fail or slow a triage response.
 */
export async function recordRun(
  presetId: string,
  predicted: Category | undefined,
  confidence: number,
): Promise<void> {
  if (!redis) return;
  const preset = PRESETS.find((p) => p.id === presetId);
  if (!preset) return;
  const correct =
    preset.expected !== null && predicted === preset.expected ? 1 : 0;
  try {
    await redis.hincrby(key(presetId), "runs", 1);
    await redis.hincrby(key(presetId), "correct", correct);
    // confidence stored as summed basis points to keep the hash integer-only
    await redis.hincrby(
      key(presetId),
      "confidenceBp",
      Math.round(confidence * 10000),
    );
  } catch {
    // scoreboard is best-effort; never surface to the caller
  }
}

export async function readScoreboard(): Promise<Scoreboard> {
  if (!redis) {
    return {
      perPreset: PRESETS.map((p) => ({
        id: p.id,
        label: p.label,
        expected: p.expected,
        runs: 0,
        correct: 0,
        accuracy: null,
        meanConfidence: null,
      })),
      totalRuns: 0,
      overallAccuracy: null,
      live: false,
    };
  }

  const rows = await Promise.all(
    PRESETS.map(async (p) => {
      const h =
        (await redis.hgetall<Record<string, string>>(key(p.id))) ?? {};
      const runs = Number(h.runs ?? 0);
      const correct = Number(h.correct ?? 0);
      const confidenceBp = Number(h.confidenceBp ?? 0);
      return {
        id: p.id,
        label: p.label,
        expected: p.expected,
        runs,
        correct,
        accuracy: p.expected !== null && runs > 0 ? correct / runs : null,
        meanConfidence: runs > 0 ? confidenceBp / 10000 / runs : null,
      } satisfies PresetScore;
    }),
  );

  const scored = rows.filter((r) => r.expected !== null && r.runs > 0);
  const totalScoredRuns = scored.reduce((s, r) => s + r.runs, 0);
  const totalCorrect = scored.reduce((s, r) => s + r.correct, 0);

  return {
    perPreset: rows,
    totalRuns: rows.reduce((s, r) => s + r.runs, 0),
    overallAccuracy: totalScoredRuns > 0 ? totalCorrect / totalScoredRuns : null,
    live: true,
  };
}
