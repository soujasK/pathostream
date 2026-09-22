/**
 * Exponentially Weighted Moving Average (EWMA) control chart for
 * statistical process control -- Roberts, S.W. (1959), "Control Chart
 * Tests Based on Geometric Moving Averages", Technometrics, 1(3), 239-250.
 * Citation independently confirmed (title, author, journal, volume/issue,
 * page range) against the paper's own listing on tandfonline.com and its
 * reproduction at stat.cmu.edu/technometrics.
 *
 * This is real statistical process control, not a heuristic dressed up as
 * one: a smoothed statistic z_t = lambda*x_t + (1-lambda)*z_{t-1} tracks a
 * process mean with memory decaying geometrically into the past, and is
 * declared "out of control" when it drifts outside control limits derived
 * from the in-control process's known mean/variance. Unlike a hard
 * threshold on the raw signal, EWMA is sensitive to small, sustained
 * shifts that a single noisy reading would not trip on its own -- exactly
 * the kind of early, gradual contamination trend a single-sample threshold
 * is blind to.
 *
 * Time-varying control limits (exact, not the common asymptotic
 * approximation): the variance of z_t under the in-control distribution is
 *   Var(z_t) = sigma0^2 * (lambda / (2 - lambda)) * (1 - (1 - lambda)^(2t))
 * which GROWS with t: the half-width is L*lambda*sigma0 at t=1 (the chart
 * has only seen one sample, so z_1 is still mostly the target) and rises
 * toward the asymptote L*sigma0*sqrt(lambda/(2-lambda)). The exact limits
 * are therefore TIGHTER than the asymptotic ones early on: they keep the
 * per-tick false-alarm probability constant from the first sample, at the
 * price of a slightly higher false-alarm rate just after a (re)start than
 * the asymptotic limit would give -- quantified in EVALUATION.md.
 * (An earlier version of this comment described the width as shrinking;
 * that was backwards, and test/ewma.test.ts now pins the real behaviour.)
 */

export interface EwmaParams {
  /** Smoothing constant in (0, 1]; smaller = more memory/inertia, larger =
   * more reactive to recent samples. 0.2-0.3 is a standard default for
   * detecting small-to-moderate sustained shifts (Roberts 1959; Hunter
   * 1986, "The exponentially weighted moving average", J. Quality Tech.). */
  lambda: number;
  /** Control-limit width in standard deviations. L=3 is the conventional
   * "three-sigma" choice used throughout industrial SPC practice. */
  L: number;
  /** In-control process mean, from historical/baseline data. */
  targetMean: number;
  /** In-control process standard deviation, from historical/baseline data. */
  targetStdDev: number;
}

export interface EwmaResult {
  tick: number;
  sample: number;
  z: number;
  upperControlLimit: number;
  lowerControlLimit: number;
  outOfControl: boolean;
}

export class EwmaDetector {
  private readonly params: EwmaParams;
  private z: number;
  private tick = 0;

  constructor(params: EwmaParams) {
    if (params.lambda <= 0 || params.lambda > 1) {
      throw new Error(`lambda must be in (0, 1], got ${params.lambda}`);
    }
    if (params.targetStdDev <= 0) {
      throw new Error(`targetStdDev must be positive, got ${params.targetStdDev}`);
    }
    this.params = params;
    this.z = params.targetMean;
  }

  /** Feed one new raw sample; returns the updated EWMA statistic, its
   * current (exact, time-varying) control limits, and whether it is
   * currently out of control. */
  update(sample: number): EwmaResult {
    const { lambda, L, targetMean, targetStdDev } = this.params;
    this.tick += 1;
    this.z = lambda * sample + (1 - lambda) * this.z;

    const varianceFactor = (lambda / (2 - lambda)) * (1 - Math.pow(1 - lambda, 2 * this.tick));
    const controlWidth = L * targetStdDev * Math.sqrt(varianceFactor);
    const upperControlLimit = targetMean + controlWidth;
    const lowerControlLimit = targetMean - controlWidth;

    return {
      tick: this.tick,
      sample,
      z: this.z,
      upperControlLimit,
      lowerControlLimit,
      outOfControl: this.z > upperControlLimit || this.z < lowerControlLimit,
    };
  }

  reset(): void {
    this.z = this.params.targetMean;
    this.tick = 0;
  }
}
