import { describe, expect, it } from "vitest";
import { brierScore, reliabilityBuckets, type Sample } from "./calibration";

describe("brierScore", () => {
  it("is 0 for perfect confident predictions", () => {
    const samples: Sample[] = [
      { confidence: 1, correct: 1 },
      { confidence: 0, correct: 0 },
    ];
    expect(brierScore(samples)).toBe(0);
  });

  it("is 0.25 for coin-flip hedging", () => {
    const samples: Sample[] = [
      { confidence: 0.5, correct: 1 },
      { confidence: 0.5, correct: 0 },
    ];
    expect(brierScore(samples)).toBeCloseTo(0.25);
  });

  it("punishes confident-and-wrong hardest", () => {
    const confidentWrong = brierScore([{ confidence: 0.9, correct: 0 }]);
    const hedgedWrong = brierScore([{ confidence: 0.5, correct: 0 }]);
    expect(confidentWrong).toBeGreaterThan(hedgedWrong);
    expect(confidentWrong).toBeCloseTo(0.81);
  });

  it("returns 0 for empty input", () => {
    expect(brierScore([])).toBe(0);
  });
});

describe("reliabilityBuckets", () => {
  it("flags overconfidence when claimed exceeds actual", () => {
    // claims 0.95 but only 50% correct
    const samples: Sample[] = [
      { confidence: 0.95, correct: 1 },
      { confidence: 0.95, correct: 0 },
      { confidence: 0.95, correct: 1 },
      { confidence: 0.95, correct: 0 },
    ];
    const buckets = reliabilityBuckets(samples);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]?.range).toBe("0.9-1.0");
    expect(buckets[0]?.actualAccuracy).toBeCloseTo(0.5);
    expect(buckets[0]?.verdict).toBe("overconfident");
  });

  it("flags calibrated when claimed matches actual", () => {
    // claims ~0.8, right 4 of 5
    const samples: Sample[] = [
      { confidence: 0.8, correct: 1 },
      { confidence: 0.8, correct: 1 },
      { confidence: 0.8, correct: 1 },
      { confidence: 0.8, correct: 1 },
      { confidence: 0.8, correct: 0 },
    ];
    const buckets = reliabilityBuckets(samples);
    expect(buckets[0]?.verdict).toBe("calibrated");
  });

  it("skips empty buckets", () => {
    const samples: Sample[] = [{ confidence: 0.95, correct: 1 }];
    const buckets = reliabilityBuckets(samples);
    expect(buckets).toHaveLength(1);
  });
});
