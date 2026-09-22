/**
 * Run-length simulation for control-chart detectors. "Run length" is the
 * number of samples until the chart first signals; its mean is the Average
 * Run Length (ARL):
 *   ARL0 -- in control (no shift): how long between FALSE alarms. Bigger is better.
 *   ARL1 -- after a mean shift of `shift` sigma: detection delay. Smaller is better.
 *
 * All data are standardised (in-control mean 0, sd 1); a mean shift of
 * `shift` means readings are drawn from mean `shift`. The EWMA detector run
 * in 'exact' mode IS the production class (analytics/ewma.ts) -- this
 * harness characterises the code that ships, not a re-implementation.
 */

import { EwmaDetector } from "../analytics/ewma.js";
import type { NoiseSource } from "./prng.js";

export interface EwmaDesign {
  lambda: number;
  L: number;
}

/** update() returns true when the chart signals. */
export interface Detector {
  update(x: number): boolean;
  reset(): void;
}

export type EwmaLimits = "exact" | "asymptotic";

/** `exact` = the production time-varying limits (ewma.ts). `asymptotic` =
 * the fixed steady-state limit L*sd*sqrt(lambda/(2-lambda)) that the
 * Markov-chain ARL calculation assumes -- used to cross-validate the two
 * methods on identical assumptions. `mean`/`sd` are the chart's assumed
 * in-control parameters (default 0/1 = correctly specified). */
export function ewmaDetector(
  design: EwmaDesign,
  options: { limits?: EwmaLimits; mean?: number; sd?: number } = {},
): Detector {
  const mean = options.mean ?? 0;
  const sd = options.sd ?? 1;
  if ((options.limits ?? "exact") === "exact") {
    const detector = new EwmaDetector({ lambda: design.lambda, L: design.L, targetMean: mean, targetStdDev: sd });
    return { update: (x) => detector.update(x).outOfControl, reset: () => detector.reset() };
  }
  const halfWidth = design.L * sd * Math.sqrt(design.lambda / (2 - design.lambda));
  let z = mean;
  return {
    update: (x) => {
      z = design.lambda * x + (1 - design.lambda) * z;
      return Math.abs(z - mean) > halfWidth;
    },
    reset: () => {
      z = mean;
    },
  };
}

/** Two-sided tabular CUSUM (Page 1954): accumulates deviations beyond a
 * reference value k (in sd units) and signals when either side exceeds h. */
export function cusumDetector(k: number, h: number): Detector {
  let high = 0;
  let low = 0;
  return {
    update: (x) => {
      high = Math.max(0, high + x - k);
      low = Math.max(0, low - x - k);
      return high > h || low > h;
    },
    reset: () => {
      high = 0;
      low = 0;
    },
  };
}

/** Shewhart individuals chart: signals on any single reading beyond k sd. */
export function shewhartDetector(k: number): Detector {
  return { update: (x) => Math.abs(x) > k, reset: () => undefined };
}

/** Ticks until the first signal (1-indexed), or `maxTicks` if it never
 * signals within the cap (right-censored; counted by the caller). */
export function runLength(detector: Detector, noise: NoiseSource, shift: number, maxTicks: number): number {
  detector.reset();
  noise.restart();
  for (let t = 1; t <= maxTicks; t++) {
    if (detector.update(shift + noise.next())) return t;
  }
  return maxTicks;
}

export interface RunLengthSummary {
  n: number;
  mean: number;
  /** Standard error of the mean. */
  se: number;
  median: number;
  p05: number;
  p95: number;
  /** Runs that hit the tick cap without signalling (their length is a
   * lower bound, so `mean` is then a lower bound too). */
  censored: number;
}

function quantile(sorted: number[], q: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[index] ?? Number.NaN;
}

export function summarize(lengths: number[], censored = 0): RunLengthSummary {
  const n = lengths.length;
  let sum = 0;
  for (const v of lengths) sum += v;
  const mean = sum / n;
  let sq = 0;
  for (const v of lengths) sq += (v - mean) * (v - mean);
  const sd = n > 1 ? Math.sqrt(sq / (n - 1)) : 0;
  const sorted = [...lengths].sort((a, b) => a - b);
  return {
    n,
    mean,
    se: sd / Math.sqrt(n),
    median: quantile(sorted, 0.5),
    p05: quantile(sorted, 0.05),
    p95: quantile(sorted, 0.95),
    censored,
  };
}

/** Monte Carlo ARL: `runs` independent run lengths. */
export function simulateArl(
  makeDetector: () => Detector,
  noise: NoiseSource,
  shift: number,
  runs: number,
  maxTicks: number,
): RunLengthSummary {
  const detector = makeDetector();
  const lengths: number[] = [];
  let censored = 0;
  for (let i = 0; i < runs; i++) {
    const length = runLength(detector, noise, shift, maxTicks);
    if (length >= maxTicks) censored += 1;
    lengths.push(length);
  }
  return summarize(lengths, censored);
}

/** Wraps a detector so it signals only after `k` CONSECUTIVE chart signals
 * -- the production escalation rule (earlyWarningEngine.ts). */
export function persistenceRule(detector: Detector, k: number): Detector {
  let consecutive = 0;
  return {
    update: (x) => {
      consecutive = detector.update(x) ? consecutive + 1 : 0;
      return consecutive >= k;
    },
    reset: () => {
      detector.reset();
      consecutive = 0;
    },
  };
}

/** Regenerative estimate of the mean time between FALSE escalations for
 * the k-consecutive rule. Runs one long stream; whenever the rule fires,
 * the detector is reset (what an operator clearing the station does) and a
 * new cycle starts. Far cheaper than independent runs when the ARL is in
 * the tens of thousands, and exactly the quantity that matters: how long a
 * station runs before it raises a false escalation. */
export function falseEscalationCycles(
  makeDetector: () => Detector,
  k: number,
  noise: NoiseSource,
  totalTicks: number,
): RunLengthSummary & { totalTicks: number } {
  const rule = persistenceRule(makeDetector(), k);
  noise.restart();
  rule.reset();
  const cycles: number[] = [];
  let sinceReset = 0;
  for (let t = 0; t < totalTicks; t++) {
    sinceReset += 1;
    if (rule.update(noise.next())) {
      cycles.push(sinceReset);
      rule.reset();
      sinceReset = 0;
    }
  }
  // No completed cycle (ARL > totalTicks): report censored at the horizon.
  if (cycles.length === 0) return { ...summarize([totalTicks], 1), totalTicks };
  return { ...summarize(cycles), totalTicks };
}

/** Bisection on a chart parameter (monotone increasing in ARL0) until the
 * simulated in-control ARL matches `targetArl0`. Uses the same seed at
 * every step (common random numbers) so the objective is smooth. */
export function calibrateParameter(
  build: (parameter: number) => Detector,
  makeNoise: () => NoiseSource,
  targetArl0: number,
  low: number,
  high: number,
  runs: number,
  maxTicks: number,
  iterations = 14,
): number {
  let lo = low;
  let hi = high;
  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) / 2;
    const arl0 = simulateArl(() => build(mid), makeNoise(), 0, runs, maxTicks).mean;
    if (arl0 < targetArl0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
