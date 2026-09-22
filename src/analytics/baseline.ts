/**
 * Phase-I baseline assessment: is a window of in-control readings good
 * enough to build a control chart from? Not wired into the demo (its
 * telemetry is synthetic with a known baseline by construction); this is
 * the gate that MUST sit in front of any real sensor feed, and the
 * thresholds come from the measured behaviour in EVALUATION.md, not from
 * convention:
 *
 *  - Too few readings: a chart whose mean/sd were estimated from n = 20
 *    readings signals within its first 50 ticks 28.6% of the time, against
 *    ~10% for a known baseline; by n = 200 that is 11.6%, near nominal.
 *  - Autocorrelation: the chart assumes independent readings; even
 *    phi = 0.1 shortens the false-alarm interval, and phi = 0.9 collapses
 *    it (see the robustness table). Autocorrelated baselines need a
 *    residual chart or a longer sampling interval, not this chart as-is.
 */

export const MIN_PHASE_ONE_READINGS = 200;
/** Floor on the tolerated lag-1 autocorrelation; widened with 1.96/sqrt(n)
 * for small n so ordinary sampling noise in the estimate doesn't reject
 * genuinely independent baselines. */
export const MAX_ABS_LAG1_AUTOCORRELATION = 0.1;

export interface BaselineAssessment {
  n: number;
  mean: number;
  sd: number;
  lag1Autocorrelation: number;
  adequate: boolean;
  problems: string[];
}

export function lag1Autocorrelation(readings: number[]): number {
  const n = readings.length;
  if (n < 3) return 0;
  const mean = readings.reduce((a, b) => a + b, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    const d = readings[i]! - mean;
    denominator += d * d;
    if (i < n - 1) numerator += d * (readings[i + 1]! - mean);
  }
  return denominator === 0 ? 0 : numerator / denominator;
}

export function assessBaseline(readings: number[]): BaselineAssessment {
  const n = readings.length;
  const mean = n > 0 ? readings.reduce((a, b) => a + b, 0) / n : Number.NaN;
  const variance = n > 1 ? readings.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (n - 1) : Number.NaN;
  const sd = Math.sqrt(variance);
  const r1 = lag1Autocorrelation(readings);

  const problems: string[] = [];
  if (n < MIN_PHASE_ONE_READINGS) {
    problems.push(`only ${n} readings; at least ${MIN_PHASE_ONE_READINGS} are needed for a near-nominal false-alarm rate`);
  }
  if (!(sd > 0)) problems.push("baseline has no variation (constant or missing readings)");
  const autocorrelationLimit = Math.max(MAX_ABS_LAG1_AUTOCORRELATION, 1.96 / Math.sqrt(Math.max(n, 1)));
  if (Math.abs(r1) > autocorrelationLimit) {
    problems.push(
      `lag-1 autocorrelation ${r1.toFixed(2)} exceeds ${autocorrelationLimit.toFixed(2)}; ` +
        "an independence-assuming chart will false-alarm far more often than designed",
    );
  }
  return { n, mean, sd, lag1Autocorrelation: r1, adequate: problems.length === 0, problems };
}
