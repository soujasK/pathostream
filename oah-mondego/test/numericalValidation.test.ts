import { describe, expect, it } from "vitest";
import { computeTransportForecast } from "../src/hydrology/advectionDispersion.js";
import { pecletNumber } from "../src/hydrology/channelDispersion.js";
import { breakthroughMoments, solveAdvectionDispersionNumerically } from "../src/hydrology/numericalValidation.js";

/**
 * Validates `computeTransportForecast`'s closed-form Taylor-dispersion
 * approximation against a DIRECT, independent numerical solution of the
 * actual governing 1D advection-dispersion PDE -- not just checking the
 * arithmetic of the closed-form formula against itself.
 *
 * Expected agreement is good but not exact, for two understood, stated
 * reasons (not unexplained noise):
 *  1. First-order upwind advection carries its own "numerical diffusion"
 *     (leading truncation-error term ~ u*dx/2, here ~0.2 m^2/s against a
 *     physical D of 1 m^2/s -- ~20% of the physical value), which
 *     broadens the numerical breakthrough curve beyond the true physical
 *     spread.
 *  2. The numerical scheme starts from a finite-width Gaussian pulse
 *     (a true delta-function release isn't representable on a finite
 *     grid), adding a small amount of extra initial variance.
 * Both push the numerical result to over-estimate spread somewhat, which
 * is exactly the direction/magnitude observed below -- so the tolerance
 * here reflects a genuinely understood discrepancy, not a fudge factor.
 */
describe("closed-form transport forecast vs. direct numerical PDE solution", () => {
  const meanVelocityMs = 0.4;
  const dispersionCoefficientM2S = 1;
  const observationPointM = 100;

  const analytical = computeTransportForecast({
    distanceKm: observationPointM / 1000,
    meanVelocityMs,
    dispersionCoefficientM2S,
  });

  const curve = solveAdvectionDispersionNumerically(
    {
      meanVelocityMs,
      dispersionCoefficientM2S,
      domainLengthM: 300,
      gridPoints: 301,
      totalTimeS: 500,
      timeSteps: 2500, // dt = 0.2s -> diffusion number 0.2, Courant number 0.08 (both well within stability)
    },
    observationPointM,
  );
  const numerical = breakthroughMoments(curve);

  it("is being tested in the large-Peclet regime the closed-form approximation is valid for", () => {
    const pe = pecletNumber(meanVelocityMs, observationPointM, dispersionCoefficientM2S);
    expect(pe).toBeGreaterThan(10);
  });

  it("matches the numerically-observed peak (mean arrival) time within 10%", () => {
    const analyticalPeakS = analytical.peakTimeMinutes * 60;
    const relativeError = Math.abs(numerical.meanTimeS - analyticalPeakS) / analyticalPeakS;
    expect(relativeError).toBeLessThan(0.1);
  });

  it("matches the numerically-observed temporal spread within 15%", () => {
    const analyticalSigmaS = analytical.temporalSpreadMinutes * 60;
    const relativeError = Math.abs(numerical.stdDevTimeS - analyticalSigmaS) / analyticalSigmaS;
    expect(relativeError).toBeLessThan(0.15);
  });

  it("the real Mondego reach parameters sit comfortably in the same large-Peclet regime", () => {
    // Distance in meters, matching MONDEGO_REACH.distanceKm=3.85 and the
    // default dispersion coefficient documented in advectionDispersion.ts.
    const pe = pecletNumber(0.36, 3850, 8);
    expect(pe).toBeGreaterThan(50);
  });
});

describe("solveAdvectionDispersionNumerically", () => {
  it("rejects an unstable discretization instead of silently producing garbage", () => {
    expect(() =>
      solveAdvectionDispersionNumerically(
        { meanVelocityMs: 0.4, dispersionCoefficientM2S: 1, domainLengthM: 300, gridPoints: 301, totalTimeS: 500, timeSteps: 10 },
        100,
      ),
    ).toThrow(/Unstable/);
  });

  it("rejects an observation point outside the domain", () => {
    expect(() =>
      solveAdvectionDispersionNumerically(
        { meanVelocityMs: 0.4, dispersionCoefficientM2S: 1, domainLengthM: 300, gridPoints: 301, totalTimeS: 500, timeSteps: 2500 },
        400,
      ),
    ).toThrow(/observationPointM/);
  });
});
