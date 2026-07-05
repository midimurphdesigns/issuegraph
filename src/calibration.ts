/**
 * Calibration report — the statistics leg.
 *
 * Given a list of { confidence the model claimed, whether it was actually
 * correct }, compute:
 *   - Brier score: average of (confidence - correct)^2. Lower = better.
 *   - Reliability buckets: group by confidence, compare claimed vs actual.
 *
 * This is the same idea as forge's calibration, computed from eval results
 * instead of a production log.
 */

export type Sample = { confidence: number; correct: 0 | 1 };

export function brierScore(samples: Sample[]): number {
  if (samples.length === 0) return 0;
  const total = samples.reduce(
    (sum, s) => sum + (s.confidence - s.correct) ** 2,
    0,
  );
  return total / samples.length;
}

export type Bucket = {
  range: string;
  count: number;
  meanConfidence: number;
  actualAccuracy: number;
  verdict: string;
};

export function reliabilityBuckets(samples: Sample[]): Bucket[] {
  const edges = [
    { range: "0.9-1.0", lo: 0.9, hi: 1.01 },
    { range: "0.75-0.9", lo: 0.75, hi: 0.9 },
    { range: "0.5-0.75", lo: 0.5, hi: 0.75 },
    { range: "0.0-0.5", lo: 0.0, hi: 0.5 },
  ];

  const buckets: Bucket[] = [];
  for (const e of edges) {
    const group = samples.filter((s) => s.confidence >= e.lo && s.confidence < e.hi);
    if (group.length === 0) continue;
    const meanConfidence =
      group.reduce((sum, s) => sum + s.confidence, 0) / group.length;
    const actualAccuracy =
      group.reduce((sum, s) => sum + s.correct, 0) / group.length;
    const gap = actualAccuracy - meanConfidence;
    const verdict =
      gap < -0.05 ? "overconfident" : gap > 0.05 ? "underconfident" : "calibrated";
    buckets.push({
      range: e.range,
      count: group.length,
      meanConfidence,
      actualAccuracy,
      verdict,
    });
  }
  return buckets;
}

export function printCalibrationReport(samples: Sample[]): void {
  console.log("\n── CALIBRATION REPORT ──────────────────────────────────");
  console.log(`samples:      ${samples.length}`);
  console.log(`Brier score:  ${brierScore(samples).toFixed(3)}  (0 = perfect, 0.25 = coin flip)`);
  console.log("\nreliability by confidence bucket:");
  console.log("  bucket      n   claimed  actual   verdict");
  for (const b of reliabilityBuckets(samples)) {
    console.log(
      `  ${b.range.padEnd(10)} ${String(b.count).padStart(2)}   ` +
        `${b.meanConfidence.toFixed(2)}     ${b.actualAccuracy.toFixed(2)}    ${b.verdict}`,
    );
  }
}
