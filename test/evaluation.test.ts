import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assessBaseline,
  lag1Autocorrelation,
  MAX_ABS_LAG1_AUTOCORRELATION,
  MIN_PHASE_ONE_READINGS,
} from "../src/analytics/baseline.js";
import {
  ESCALATION_THRESHOLD_TICKS as ENGINE_THRESHOLD,
  EWMA_L,
  EWMA_LAMBDA,
} from "../src/analytics/detectorConfig.js";
import { EwmaDetector } from "../src/analytics/ewma.js";
import { ALL_STATIONS } from "../src/data/catchments.js";
import {
  NETWORK_STATIONS,
  QUICK_CONFIG,
  runEvaluation,
  smallestPersistenceMeetingTarget,
  type EvaluationResults,
} from "../src/evaluation/experiments.js";
import { ewmaArlMarkov } from "../src/evaluation/markov.js";
import { normalCdf, normalQuantile } from "../src/evaluation/normal.js";
import { ar1Noise, gaussianNoise, lognormalNoise, mulberry32 } from "../src/evaluation/prng.js";
import { renderEvaluationMarkdown } from "../src/evaluation/render.js";
import {
  cusumDetector,
  ewmaDetector,
  falseEscalationCycles,
  persistenceRule,
  shewhartDetector,
  simulateArl,
  type Detector,
} from "../src/evaluation/runLength.js";

const DESIGN = { lambda: EWMA_LAMBDA, L: EWMA_L };

/** Independent check of the normal CDF: Simpson integration of the density. */
function simpsonCdf(x: number): number {
  const n = 20_000;
  const h = x / n;
  const density = (t: number) => Math.exp((-t * t) / 2) / Math.sqrt(2 * Math.PI);
  let sum = density(0) + density(x);
  for (let i = 1; i < n; i++) sum += density(i * h) * (i % 2 === 0 ? 2 : 4);
  return 0.5 + (h / 3) * sum;
}

describe("normal CDF / quantile (full precision)", () => {
  it("matches Simpson-rule integration of the density to 1e-12", () => {
    for (const x of [0.5, 1, 1.96, 3, 5]) {
      expect(Math.abs(normalCdf(x) - simpsonCdf(x))).toBeLessThan(1e-12);
    }
  });

  it("matches known values and is symmetric", () => {
    expect(normalCdf(0)).toBe(0.5);
    expect(normalCdf(1.96)).toBeCloseTo(0.9750021048517795, 12);
    expect(normalCdf(-3)).toBeCloseTo(0.0013498980316301, 13);
    expect(normalCdf(-2.2) + normalCdf(2.2)).toBeCloseTo(1, 14);
  });

  it("quantile inverts the CDF", () => {
    for (const p of [0.001, 0.025, 0.5, 0.975, 0.9987]) {
      expect(normalCdf(normalQuantile(p))).toBeCloseTo(p, 12);
    }
  });
});

describe("Markov-chain ARL (independent of simulation)", () => {
  it("reduces to the exact Shewhart ARL when lambda = 1", () => {
    const exact = 1 / (2 * normalCdf(-3)); // 370.398...
    const markov = ewmaArlMarkov({ lambda: 1, L: 3, shift: 0, cells: 401 });
    expect(Math.abs(markov - exact) / exact).toBeLessThan(1e-8);
  });

  it("converges as the grid is refined, near 502.9 for the shipped design", () => {
    const coarse = ewmaArlMarkov({ ...DESIGN, shift: 0, cells: 101 });
    const fine = ewmaArlMarkov({ ...DESIGN, shift: 0, cells: 401 });
    expect(Math.abs(fine - coarse) / fine).toBeLessThan(0.005);
    expect(fine).toBeGreaterThan(500);
    expect(fine).toBeLessThan(505);
  });

  it("is symmetric in the sign of the shift and decreasing in its size", () => {
    const at = (shift: number) => ewmaArlMarkov({ ...DESIGN, shift, cells: 201 });
    expect(at(-1)).toBeCloseTo(at(1), 6);
    expect(at(0.5)).toBeGreaterThan(at(1));
    expect(at(1)).toBeGreaterThan(at(2));
    expect(at(2)).toBeGreaterThan(at(3));
  });
});

describe("Monte Carlo agrees with the Markov chain", () => {
  it("asymptotic-limit EWMA ARL0 is within 3.5 standard errors of the Markov value", () => {
    const markov = ewmaArlMarkov({ ...DESIGN, shift: 0, cells: 401 });
    const mc = simulateArl(
      () => ewmaDetector(DESIGN, { limits: "asymptotic" }),
      gaussianNoise(mulberry32(11)),
      0,
      8_000,
      1_000_000,
    );
    expect(Math.abs(mc.mean - markov)).toBeLessThan(3.5 * mc.se);
  });

  it("shifted ARL1 also agrees (1 sigma)", () => {
    const markov = ewmaArlMarkov({ ...DESIGN, shift: 1, cells: 401 });
    const mc = simulateArl(
      () => ewmaDetector(DESIGN, { limits: "asymptotic" }),
      gaussianNoise(mulberry32(12)),
      1,
      20_000,
      100_000,
    );
    expect(Math.abs(mc.mean - markov)).toBeLessThan(3.5 * mc.se);
  });
});

describe("EWMA control limits (pins the corrected docstring)", () => {
  it("start at L*lambda*sigma and GROW toward the asymptote (they do not shrink)", () => {
    const detector = new EwmaDetector({ lambda: EWMA_LAMBDA, L: EWMA_L, targetMean: 0, targetStdDev: 1 });
    const widths = Array.from({ length: 40 }, () => detector.update(0).upperControlLimit);
    expect(widths[0]).toBeCloseTo(EWMA_L * EWMA_LAMBDA, 12);
    for (let i = 1; i < widths.length; i++) expect(widths[i]!).toBeGreaterThan(widths[i - 1]!);
    expect(widths.at(-1)).toBeCloseTo(EWMA_L * Math.sqrt(EWMA_LAMBDA / (2 - EWMA_LAMBDA)), 6);
  });

  it("are tighter than the asymptotic limit at tick 1, so a 3.2-sigma first reading signals only under exact limits", () => {
    const exact = ewmaDetector(DESIGN);
    const asymptotic = ewmaDetector(DESIGN, { limits: "asymptotic" });
    expect(exact.update(3.2)).toBe(true);
    expect(asymptotic.update(3.2)).toBe(false);
  });
});

describe("baseline detectors", () => {
  it("Shewhart signals on a single reading beyond k sigma, either side", () => {
    const d = shewhartDetector(3);
    expect(d.update(2.9)).toBe(false);
    expect(d.update(3.1)).toBe(true);
    expect(d.update(-3.1)).toBe(true);
  });

  it("two-sided CUSUM accumulates a sustained shift and resets to zero", () => {
    const d = cusumDetector(0.5, 4);
    let signalled = 0;
    for (let i = 1; i <= 10 && !signalled; i++) if (d.update(1.5)) signalled = i; // drift of 1.0 per tick
    expect(signalled).toBe(5); // 4 crossed strictly on the 5th reading
    d.reset();
    expect(d.update(0)).toBe(false);
  });
});

describe("persistence (k consecutive) rule", () => {
  function scripted(sequence: boolean[]): Detector {
    let i = 0;
    return { update: () => sequence[i++] ?? false, reset: () => (i = 0) };
  }

  it("fires exactly on the k-th consecutive signal and not before", () => {
    const rule = persistenceRule(scripted([true, true, false, true, true, true]), 3);
    expect([1, 2, 3, 4, 5, 6].map(() => rule.update(0))).toEqual([false, false, false, false, false, true]);
  });

  it("k = 1 is the bare detector", () => {
    const rule = persistenceRule(scripted([false, true]), 1);
    expect([rule.update(0), rule.update(0)]).toEqual([false, true]);
  });
});

describe("false-escalation regenerative estimator", () => {
  it("for k = 1 reproduces the plain ARL0 (~500) within tolerance", () => {
    const result = falseEscalationCycles(() => ewmaDetector(DESIGN), 1, gaussianNoise(mulberry32(21)), 1_000_000);
    expect(result.n).toBeGreaterThan(1_500);
    expect(result.mean).toBeGreaterThan(465);
    expect(result.mean).toBeLessThan(535);
  });

  it("longer persistence gives (much) longer false-escalation intervals", () => {
    const at = (k: number) =>
      falseEscalationCycles(() => ewmaDetector(DESIGN), k, gaussianNoise(mulberry32(22 + k)), 1_500_000).mean;
    expect(at(2)).toBeGreaterThan(3 * at(1));
    expect(at(3)).toBeGreaterThan(2.5 * at(2));
  });
});

describe("noise models", () => {
  it("AR(1) has the requested lag-1 autocorrelation and unit variance", () => {
    const noise = ar1Noise(mulberry32(31), 0.6);
    const x = Array.from({ length: 60_000 }, () => noise.next());
    const mean = x.reduce((a, b) => a + b, 0) / x.length;
    const variance = x.reduce((s, v) => s + (v - mean) ** 2, 0) / x.length;
    expect(lag1Autocorrelation(x)).toBeGreaterThan(0.57);
    expect(lag1Autocorrelation(x)).toBeLessThan(0.63);
    expect(variance).toBeGreaterThan(0.95);
    expect(variance).toBeLessThan(1.05);
  });

  it("lognormal noise is standardised and right-skewed", () => {
    const noise = lognormalNoise(mulberry32(32), 0.2);
    const x = Array.from({ length: 100_000 }, () => noise.next());
    const mean = x.reduce((a, b) => a + b, 0) / x.length;
    const sd = Math.sqrt(x.reduce((s, v) => s + (v - mean) ** 2, 0) / x.length);
    const skew = x.reduce((s, v) => s + ((v - mean) / sd) ** 3, 0) / x.length;
    expect(Math.abs(mean)).toBeLessThan(0.02);
    expect(sd).toBeGreaterThan(0.97);
    expect(sd).toBeLessThan(1.03);
    expect(skew).toBeGreaterThan(0.4);
  });

  it("the seeded PRNG is reproducible", () => {
    const a = mulberry32(99);
    const b = mulberry32(99);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe("baseline adequacy gate (analytics/baseline.ts)", () => {
  const iid = (n: number, seed: number) => {
    const noise = gaussianNoise(mulberry32(seed));
    return Array.from({ length: n }, () => 15 + 3 * noise.next());
  };

  it("accepts a long independent baseline and recovers its mean and sd", () => {
    const a = assessBaseline(iid(1_000, 41));
    expect(a.adequate).toBe(true);
    expect(a.mean).toBeCloseTo(15, 0);
    expect(a.sd).toBeGreaterThan(2.8);
    expect(a.sd).toBeLessThan(3.2);
  });

  it("rejects a window shorter than the minimum", () => {
    const a = assessBaseline(iid(MIN_PHASE_ONE_READINGS - 1, 42));
    expect(a.adequate).toBe(false);
    expect(a.problems.join(" ")).toContain("readings");
  });

  it("rejects a strongly autocorrelated baseline even when long", () => {
    const noise = ar1Noise(mulberry32(43), 0.6);
    const a = assessBaseline(Array.from({ length: 1_000 }, () => 15 + 3 * noise.next()));
    expect(a.adequate).toBe(false);
    expect(a.problems.join(" ")).toContain("autocorrelation");
    expect(a.lag1Autocorrelation).toBeGreaterThan(MAX_ABS_LAG1_AUTOCORRELATION);
  });

  it("rejects a constant or empty baseline", () => {
    expect(assessBaseline(new Array(300).fill(15)).adequate).toBe(false);
    expect(assessBaseline([]).adequate).toBe(false);
  });

  it("lag-1 autocorrelation is negative for an alternating series", () => {
    expect(lag1Autocorrelation([1, -1, 1, -1, 1, -1, 1, -1])).toBeLessThan(-0.7);
  });
});

describe("full evaluation pipeline (small config)", () => {
  const results = runEvaluation(QUICK_CONFIG);

  it("reports the shipped design", () => {
    expect(results.design.lambda).toBe(EWMA_LAMBDA);
    expect(results.design.L).toBe(EWMA_L);
    expect(results.design.escalationThresholdTicks).toBe(ENGINE_THRESHOLD);
  });

  it("EWMA beats an equal-ARL0 Shewhart chart on small shifts and everything ties on the demo's 15-sigma shift", () => {
    const at = (shift: number) => results.delay.rows.find((r) => r.shift === shift)!;
    expect(at(1).ewma.mean).toBeLessThan(at(1).shewhartMean / 3);
    expect(at(0.5).cusum.mean).toBeLessThan(at(0.5).ewma.mean); // CUSUM wins at 0.5 sigma
    expect(at(2).ewma.mean).toBeLessThan(at(2).cusum.mean); // EWMA wins from 1.5 sigma up
    expect(at(15).ewma.mean).toBe(1);
    expect(at(15).cusum.mean).toBe(1);
  });

  it("delay grows with the persistence requirement", () => {
    const delayAt = (k: number) => results.persistence.find((p) => p.k === k)!.delays.find((d) => d.shift === 15)!.summary.mean;
    expect(delayAt(5)).toBe(5); // a 15-sigma shift signals from tick 1, so k consecutive = k ticks
    expect(delayAt(3)).toBe(3);
  });

  it("misspecified sd and strong autocorrelation collapse the false-alarm interval", () => {
    const row = (prefix: string) => results.robustness.find((r) => r.scenario.startsWith(prefix))!;
    const base = row("Design assumptions hold").arl0.mean;
    expect(row("True sd 2x").arl0.mean).toBeLessThan(base / 10);
    expect(row("Autocorrelated, phi = 0.9").arl0.mean).toBeLessThan(base / 8);
    expect(row("True sd 1.25x").arl0.mean).toBeLessThan(base / 3);
  });

  it("the small Phase-I window is far worse early than a large one", () => {
    expect(results.phaseOne[0]!.earlyFalseAlarmShare).toBeGreaterThan(results.phaseOne.at(-1)!.earlyFalseAlarmShare + 0.08);
  });

  it("the baseline gate's false-reject rate is small on independent data and its power is high for phi = 0.6", () => {
    const g = (n: number, phi: number) => results.gate.find((x) => x.n === n && x.phi === phi)!.rejectShare;
    expect(g(1000, 0)).toBeLessThan(0.06);
    expect(g(200, 0.6)).toBeGreaterThan(0.95);
  });
});

/**
 * STALENESS GUARDS. evaluation/results.json and EVALUATION.md are generated
 * by `npm run evaluate`. These tests fail when the shipped design, the
 * network, or the committed documents drift apart, so the evidence can never
 * quietly describe a different system from the one that ships.
 */
describe("committed evaluation is in sync with the shipped system", () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const results = JSON.parse(read("../evaluation/results.json")) as EvaluationResults & {
    generatedWith?: { node: string; seed: number };
  };

  it("was generated for the shipped EWMA design and escalation threshold", () => {
    expect(results.design).toEqual({ lambda: EWMA_LAMBDA, L: EWMA_L, escalationThresholdTicks: ENGINE_THRESHOLD });
  });

  it("was generated for the shipped station count", () => {
    expect(NETWORK_STATIONS).toBe(ALL_STATIONS.length);
    expect(results.networkStations).toBe(ALL_STATIONS.length);
  });

  it("supports the shipped escalation threshold: it is the smallest k meeting the stated design target", () => {
    expect(smallestPersistenceMeetingTarget(results.persistence, results.networkStations)).toBe(ENGINE_THRESHOLD);
  });

  it("EVALUATION.md is exactly what the renderer produces from the committed results", () => {
    expect(read("../EVALUATION.md")).toBe(renderEvaluationMarkdown(results));
  });
});
