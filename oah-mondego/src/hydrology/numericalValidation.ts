/**
 * Direct numerical (finite-difference) solution of the governing 1D
 * advection-dispersion equation:
 *
 *   dC/dt + u * dC/dx = D * d^2C/dx^2
 *
 * used ONLY to independently validate `computeTransportForecast`'s
 * closed-form Taylor-dispersion approximation in advectionDispersion.ts --
 * this module is not part of the forecasting path (the closed-form
 * formula is O(1) to evaluate; a finite-difference solve is O(grid *
 * steps) and has no reason to run in production).
 *
 * Method: explicit first-order-upwind advection + central-difference
 * diffusion on a uniform grid, starting from a narrow Gaussian pulse near
 * x=0 (a delta-function release isn't representable on a finite grid).
 * Stability requires the advective Courant number (u*dt/dx) <= 1 and the
 * diffusion number (D*dt/dx^2) <= 0.5; both are checked and thrown on
 * violation rather than silently producing an unstable, meaningless
 * result.
 */

export interface NumericalSolveParams {
  meanVelocityMs: number;
  dispersionCoefficientM2S: number;
  /** Total spatial domain length (m); must comfortably exceed the
   * observation point plus the plume's expected travel + spread within
   * `totalTimeS`, or the pulse will reach the (absorbing) boundary and
   * the result becomes meaningless. */
  domainLengthM: number;
  gridPoints: number;
  totalTimeS: number;
  timeSteps: number;
}

export interface BreakthroughCurve {
  timesS: number[];
  concentrationAtObservationPoint: number[];
}

export function solveAdvectionDispersionNumerically(
  params: NumericalSolveParams,
  observationPointM: number,
): BreakthroughCurve {
  const {
    meanVelocityMs: u,
    dispersionCoefficientM2S: D,
    domainLengthM: L,
    gridPoints: N,
    totalTimeS: T,
    timeSteps: nt,
  } = params;

  if (N < 3) throw new Error("gridPoints must be at least 3");
  const dx = L / (N - 1);
  const dt = T / nt;

  const advectionCourantNumber = (u * dt) / dx;
  const diffusionNumber = (D * dt) / dx ** 2;
  if (advectionCourantNumber > 1) {
    throw new Error(`Unstable scheme: advection Courant number ${advectionCourantNumber.toFixed(3)} > 1`);
  }
  if (diffusionNumber > 0.5) {
    throw new Error(`Unstable scheme: diffusion number ${diffusionNumber.toFixed(3)} > 0.5`);
  }
  if (observationPointM <= 0 || observationPointM >= L) {
    throw new Error("observationPointM must lie strictly inside the domain");
  }

  let C = new Float64Array(N);
  // Centered several pulse-widths from the left (absorbing) boundary and
  // wide enough relative to dx to keep high-frequency Fourier content low
  // -- a too-narrow/too-close initial pulse leaves noise that an explicit
  // scheme near its stability limit won't damp, contaminating the result.
  const pulseWidthM = Math.max(dx * 3, L * 0.01);
  const pulseCenterM = pulseWidthM * 4;
  for (let i = 0; i < N; i++) {
    const x = i * dx;
    C[i] = Math.exp(-((x - pulseCenterM) ** 2) / (2 * pulseWidthM ** 2));
  }

  const obsIndex = Math.round(observationPointM / dx);
  const timesS: number[] = [];
  const concentrationAtObservationPoint: number[] = [];

  for (let step = 0; step <= nt; step++) {
    timesS.push(step * dt);
    concentrationAtObservationPoint.push(C[obsIndex] ?? 0);

    if (step === nt) break;
    const next = new Float64Array(N);
    for (let i = 1; i < N - 1; i++) {
      const ci = C[i]!;
      const advectionTerm = u * ((ci - C[i - 1]!) / dx); // first-order upwind, valid for u > 0
      const diffusionTerm = D * ((C[i + 1]! - 2 * ci + C[i - 1]!) / dx ** 2);
      next[i] = ci + dt * (-advectionTerm + diffusionTerm);
    }
    next[0] = 0;
    next[N - 1] = 0;
    C = next;
  }

  return { timesS, concentrationAtObservationPoint };
}

/** Concentration-weighted first and second moments of a breakthrough
 * curve -- the numerical analogue of `computeTransportForecast`'s
 * peakTimeMinutes / temporalSpreadMinutes, extracted independently from
 * the PDE solution rather than the closed-form formula. */
export function breakthroughMoments(curve: BreakthroughCurve): { meanTimeS: number; stdDevTimeS: number } {
  const { timesS, concentrationAtObservationPoint } = curve;
  let totalMass = 0;
  let weightedTime = 0;
  for (let i = 0; i < timesS.length; i++) {
    totalMass += concentrationAtObservationPoint[i]!;
    weightedTime += concentrationAtObservationPoint[i]! * timesS[i]!;
  }
  if (totalMass <= 0) throw new Error("No mass observed at the observation point -- check domain/time sizing");
  const meanTimeS = weightedTime / totalMass;

  let weightedSquaredDeviation = 0;
  for (let i = 0; i < timesS.length; i++) {
    weightedSquaredDeviation += concentrationAtObservationPoint[i]! * (timesS[i]! - meanTimeS) ** 2;
  }
  const stdDevTimeS = Math.sqrt(weightedSquaredDeviation / totalMass);

  return { meanTimeS, stdDevTimeS };
}
