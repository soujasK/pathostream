/**
 * Standard normal CDF / quantile at full double precision, for the
 * evaluation harness. Deliberately NOT the Abramowitz-Stegun approximation
 * used by the transport model (advectionDispersion.ts, ~1e-7 accuracy):
 * the Markov-chain ARL calculation sums ~10^4 tiny probabilities against an
 * exit probability of ~2e-3, so 1e-7 per-entry error would be a visible
 * fraction of the answer.
 *
 * erf(x) = (2/sqrt(pi)) * exp(-x^2) * sum_{n>=0} 2^n x^(2n+1) / (2n+1)!!
 * -- every term is positive, so there is no cancellation and the series is
 * accurate to ~1e-16 for the |x| <= 6 range that matters. Independently
 * checked against Simpson-rule integration of the density in
 * test/evaluation.test.ts.
 */

const TWO_OVER_SQRT_PI = 2 / Math.sqrt(Math.PI);

function erfNonNegative(x: number): number {
  if (x > 6) return 1;
  const x2 = x * x;
  let term = x;
  let sum = x;
  for (let n = 1; n < 500; n++) {
    term *= (2 * x2) / (2 * n + 1);
    sum += term;
    if (term < sum * 1e-17) break;
  }
  return TWO_OVER_SQRT_PI * Math.exp(-x2) * sum;
}

export function normalCdf(x: number): number {
  const e = erfNonNegative(Math.abs(x) / Math.SQRT2);
  return x >= 0 ? 0.5 + 0.5 * e : 0.5 - 0.5 * e;
}

/** Inverse CDF by bisection -- slow but exact enough (1e-15) and only used
 * to calibrate a chart's limit, never in a hot loop. */
export function normalQuantile(p: number): number {
  if (p <= 0 || p >= 1) throw new Error(`p must be in (0, 1), got ${p}`);
  let lo = -12;
  let hi = 12;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (normalCdf(mid) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
