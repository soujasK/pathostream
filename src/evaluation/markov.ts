/**
 * Exact-to-discretisation ARL of an EWMA chart by the Markov-chain method
 * (Brook & Evans 1972; applied to EWMA by Lucas & Saccucci 1990,
 * Technometrics 32(1):1-12). An independent, non-simulation check on the
 * Monte Carlo numbers.
 *
 * The in-control region (-H, H) of the EWMA statistic is cut into m equal
 * cells. From cell centre c_i, the next statistic
 *   z' = lambda*x + (1-lambda)*c_i,  x ~ N(shift, 1)
 * lands in cell j with probability Phi(u_j) - Phi(l_j). With R the m x m
 * matrix of those transient-to-transient probabilities, the expected
 * number of steps to signal from each cell solves (I - R) * arl = 1, and
 * the answer is the entry for the centre cell (chart starts at its target).
 *
 * Assumes the fixed steady-state limit H = L*sqrt(lambda/(2-lambda)); the
 * production chart uses exact time-varying limits, so it signals slightly
 * more readily in its first few ticks -- the harness quantifies that gap by
 * simulation (see EVALUATION.md).
 */

import { normalCdf } from "./normal.js";

export function ewmaArlMarkov(options: { lambda: number; L: number; shift: number; cells?: number }): number {
  const { lambda, L, shift } = options;
  const cells = (options.cells ?? 201) | 1; // force odd so a cell is centred on the target
  const half = (cells - 1) / 2;
  const limit = L * Math.sqrt(lambda / (2 - lambda));
  const width = (2 * limit) / cells;

  // Augmented matrix [I - R | 1].
  const a: number[][] = [];
  for (let i = 0; i < cells; i++) {
    const centreI = (i - half) * width;
    const row = new Array<number>(cells + 1).fill(0);
    for (let j = 0; j < cells; j++) {
      const centreJ = (j - half) * width;
      const upper = (centreJ + width / 2 - (1 - lambda) * centreI) / lambda - shift;
      const lower = (centreJ - width / 2 - (1 - lambda) * centreI) / lambda - shift;
      row[j] = (i === j ? 1 : 0) - (normalCdf(upper) - normalCdf(lower));
    }
    row[cells] = 1;
    a.push(row);
  }

  // Gaussian elimination with partial pivoting.
  for (let col = 0; col < cells; col++) {
    let pivot = col;
    for (let r = col + 1; r < cells; r++) {
      if (Math.abs(a[r]![col]!) > Math.abs(a[pivot]![col]!)) pivot = r;
    }
    [a[col], a[pivot]] = [a[pivot]!, a[col]!];
    const pivotRow = a[col]!;
    const pivotValue = pivotRow[col]!;
    for (let r = col + 1; r < cells; r++) {
      const row = a[r]!;
      const factor = row[col]! / pivotValue;
      if (factor === 0) continue;
      for (let c = col; c <= cells; c++) row[c] = row[c]! - factor * pivotRow[c]!;
    }
  }
  const x = new Array<number>(cells).fill(0);
  for (let r = cells - 1; r >= 0; r--) {
    const row = a[r]!;
    let sum = row[cells]!;
    for (let c = r + 1; c < cells; c++) sum -= row[c]! * x[c]!;
    x[r] = sum / row[r]!;
  }
  return x[half]!;
}
