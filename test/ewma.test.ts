import { describe, expect, it } from "vitest";
import { EwmaDetector } from "../src/analytics/ewma.js";

/** Deterministic PRNG (mulberry32) so noise-driven tests are reproducible,
 * not flaky. Not used anywhere in production code, test-only. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussianFrom(rng: () => number): number {
  const u1 = Math.max(rng(), Number.EPSILON);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

describe("EwmaDetector", () => {
  it("rejects an invalid lambda", () => {
    expect(() => new EwmaDetector({ lambda: 0, L: 3, targetMean: 15, targetStdDev: 3 })).toThrow();
    expect(() => new EwmaDetector({ lambda: 1.5, L: 3, targetMean: 15, targetStdDev: 3 })).toThrow();
  });

  it("rejects a non-positive targetStdDev", () => {
    expect(() => new EwmaDetector({ lambda: 0.25, L: 3, targetMean: 15, targetStdDev: 0 })).toThrow();
  });

  it("matches the closed-form control-limit width at tick 1", () => {
    const lambda = 0.25;
    const L = 3;
    const targetMean = 15;
    const targetStdDev = 3;
    const detector = new EwmaDetector({ lambda, L, targetMean, targetStdDev });
    const result = detector.update(targetMean);
    const expectedWidth = L * targetStdDev * Math.sqrt((lambda / (2 - lambda)) * (1 - Math.pow(1 - lambda, 2)));
    expect(result.upperControlLimit).toBeCloseTo(targetMean + expectedWidth, 10);
    expect(result.lowerControlLimit).toBeCloseTo(targetMean - expectedWidth, 10);
  });

  it("widens control limits from tick 1 toward the asymptotic value as more samples arrive", () => {
    const detector = new EwmaDetector({ lambda: 0.25, L: 3, targetMean: 15, targetStdDev: 3 });
    const first = detector.update(15);
    let latest = first;
    for (let i = 0; i < 50; i++) latest = detector.update(15);
    const firstWidth = first.upperControlLimit - 15;
    const laterWidth = latest.upperControlLimit - 15;
    expect(laterWidth).toBeGreaterThan(firstWidth);
    // Asymptotic width: L * sigma * sqrt(lambda / (2 - lambda))
    const asymptoticWidth = 3 * 3 * Math.sqrt(0.25 / (2 - 0.25));
    expect(laterWidth).toBeCloseTo(asymptoticWidth, 3);
  });

  it("does not false-alarm on stationary in-control noise", () => {
    const rng = mulberry32(42);
    const detector = new EwmaDetector({ lambda: 0.25, L: 3, targetMean: 15, targetStdDev: 3 });
    let falseAlarms = 0;
    for (let i = 0; i < 300; i++) {
      const sample = 15 + 3 * gaussianFrom(rng);
      const result = detector.update(sample);
      if (result.outOfControl) falseAlarms += 1;
    }
    // Three-sigma EWMA limits should very rarely trip on pure in-control
    // noise -- allow a small nonzero tolerance rather than asserting zero,
    // since this is a real stochastic process, not a fixed sequence.
    expect(falseAlarms).toBeLessThan(5);
  });

  it("detects a sustained mean-shift within a bounded number of samples", () => {
    const rng = mulberry32(7);
    const detector = new EwmaDetector({ lambda: 0.25, L: 3, targetMean: 15, targetStdDev: 3 });
    // 20 in-control samples to establish steady state.
    for (let i = 0; i < 20; i++) {
      detector.update(15 + 3 * gaussianFrom(rng));
    }
    // Then a sustained +45 NTU shift (this project's documented event
    // magnitude) -- detection should trip well within 20 samples.
    let detectedAt = -1;
    for (let i = 0; i < 20; i++) {
      const result = detector.update(60 + 3 * gaussianFrom(rng));
      if (result.outOfControl && detectedAt === -1) detectedAt = i;
    }
    expect(detectedAt).toBeGreaterThanOrEqual(0);
    expect(detectedAt).toBeLessThan(20);
  });

  it("reset() returns the detector to its initial state", () => {
    const detector = new EwmaDetector({ lambda: 0.25, L: 3, targetMean: 15, targetStdDev: 3 });
    detector.update(200);
    detector.update(200);
    detector.reset();
    const result = detector.update(15);
    expect(result.tick).toBe(1);
    expect(result.z).toBeCloseTo(0.25 * 15 + 0.75 * 15, 10);
  });
});
