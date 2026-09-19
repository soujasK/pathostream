import { describe, expect, it } from "vitest";
import { EVENT_MEAN_SHIFT_NTU, NORMAL_BASELINE, nextTurbidityReading } from "../src/analytics/telemetryStream.js";

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

describe("nextTurbidityReading", () => {
  it("clusters around the baseline mean with no injected event", () => {
    const rng = mulberry32(1);
    const samples = Array.from({ length: 500 }, (_, i) => nextTurbidityReading(i + 1, null, rng));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeGreaterThan(NORMAL_BASELINE.meanNtu - 1);
    expect(mean).toBeLessThan(NORMAL_BASELINE.meanNtu + 1);
  });

  it("leaves readings before the event start tick unaffected", () => {
    const rng = mulberry32(2);
    const samples = Array.from({ length: 200 }, (_, i) => nextTurbidityReading(i + 1, 1000, rng));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeLessThan(NORMAL_BASELINE.meanNtu + 2);
  });

  it("shifts the mean by EVENT_MEAN_SHIFT_NTU from the event start tick onward", () => {
    const rng = mulberry32(3);
    const eventStart = 50;
    const samples = Array.from({ length: 500 }, (_, i) => nextTurbidityReading(i + 1, eventStart, rng));
    const post = samples.slice(eventStart - 1);
    const mean = post.reduce((a, b) => a + b, 0) / post.length;
    const expectedMean = NORMAL_BASELINE.meanNtu + EVENT_MEAN_SHIFT_NTU;
    expect(mean).toBeGreaterThan(expectedMean - 2);
    expect(mean).toBeLessThan(expectedMean + 2);
  });

  it("never returns a negative reading", () => {
    const rng = mulberry32(4);
    for (let i = 0; i < 1000; i++) {
      expect(nextTurbidityReading(i + 1, null, rng)).toBeGreaterThanOrEqual(0);
    }
  });
});
