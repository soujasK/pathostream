import { describe, expect, it } from "vitest";
import {
  arrivalProbability,
  computeTransportForecast,
  relativeIntensityAt,
} from "../src/hydrology/advectionDispersion.js";
import { classifyWfdEcologicalStatus } from "../src/hydrology/wfdClassification.js";
const MONDEGO_REACH = { distanceKm: 3.85, meanVelocityMs: 0.36 }; // representative test parameters (matches the Ponte de Santa Clara -> Parque Verde do Mondego segment)

describe("computeTransportForecast", () => {
  it("computes peak time as the simple advective travel time x/u", () => {
    const forecast = computeTransportForecast({ distanceKm: 3.85, meanVelocityMs: 0.36 });
    const expectedPeakMinutes = ((3.85 * 1000) / 0.36) / 60;
    expect(forecast.peakTimeMinutes).toBeCloseTo(expectedPeakMinutes, 6);
  });

  it("orders arrival < peak < clearance", () => {
    const forecast = computeTransportForecast(MONDEGO_REACH);
    expect(forecast.arrivalTimeMinutes).toBeLessThan(forecast.peakTimeMinutes);
    expect(forecast.peakTimeMinutes).toBeLessThan(forecast.clearanceTimeMinutes);
  });

  it("is symmetric around the peak (matches the Gaussian assumption)", () => {
    const forecast = computeTransportForecast(MONDEGO_REACH);
    const belowSpread = forecast.peakTimeMinutes - forecast.arrivalTimeMinutes;
    const aboveSpread = forecast.clearanceTimeMinutes - forecast.peakTimeMinutes;
    expect(belowSpread).toBeCloseTo(aboveSpread, 6);
  });

  it("clamps arrival time at zero rather than going negative", () => {
    // A tiny distance / huge dispersion should try to push arrival below 0.
    const forecast = computeTransportForecast({
      distanceKm: 0.01,
      meanVelocityMs: 0.36,
      dispersionCoefficientM2S: 500,
    });
    expect(forecast.arrivalTimeMinutes).toBeGreaterThanOrEqual(0);
  });

  it("larger dispersion coefficients widen the arrival/clearance window", () => {
    const narrow = computeTransportForecast({ ...MONDEGO_REACH, dispersionCoefficientM2S: 2 });
    const wide = computeTransportForecast({ ...MONDEGO_REACH, dispersionCoefficientM2S: 40 });
    const narrowWidth = narrow.clearanceTimeMinutes - narrow.arrivalTimeMinutes;
    const wideWidth = wide.clearanceTimeMinutes - wide.arrivalTimeMinutes;
    expect(wideWidth).toBeGreaterThan(narrowWidth);
  });

  it("rejects non-positive inputs rather than silently producing nonsense", () => {
    expect(() => computeTransportForecast({ distanceKm: 0, meanVelocityMs: 0.36 })).toThrow();
    expect(() => computeTransportForecast({ distanceKm: 3.85, meanVelocityMs: 0 })).toThrow();
    expect(() =>
      computeTransportForecast({ distanceKm: 3.85, meanVelocityMs: 0.36, dispersionCoefficientM2S: -1 }),
    ).toThrow();
  });
});

describe("relativeIntensityAt", () => {
  it("peaks (returns ~1) exactly at the peak time", () => {
    const forecast = computeTransportForecast(MONDEGO_REACH);
    expect(relativeIntensityAt(forecast.peakTimeMinutes, forecast)).toBeCloseTo(1, 6);
  });

  it("decays away from the peak in both directions", () => {
    const forecast = computeTransportForecast(MONDEGO_REACH);
    const atPeak = relativeIntensityAt(forecast.peakTimeMinutes, forecast);
    const before = relativeIntensityAt(forecast.arrivalTimeMinutes, forecast);
    const after = relativeIntensityAt(forecast.clearanceTimeMinutes, forecast);
    expect(before).toBeLessThan(atPeak);
    expect(after).toBeLessThan(atPeak);
  });
});

describe("arrivalProbability", () => {
  it("is exactly 0.5 at the peak time (CDF of a Gaussian at its own mean)", () => {
    const forecast = computeTransportForecast(MONDEGO_REACH);
    expect(arrivalProbability(forecast.peakTimeMinutes, forecast)).toBeCloseTo(0.5, 6);
  });

  it("is monotonically increasing in elapsed time", () => {
    const forecast = computeTransportForecast(MONDEGO_REACH);
    const samples = [0, 30, 60, 90, 120, forecast.peakTimeMinutes, 200, 250, 300].map((t) =>
      arrivalProbability(t, forecast),
    );
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]!);
    }
  });

  it("stays within [0, 1] far from the peak", () => {
    const forecast = computeTransportForecast(MONDEGO_REACH);
    expect(arrivalProbability(0, forecast)).toBeGreaterThanOrEqual(0);
    expect(arrivalProbability(0, forecast)).toBeLessThan(0.5);
    expect(arrivalProbability(10000, forecast)).toBeLessThanOrEqual(1);
    expect(arrivalProbability(10000, forecast)).toBeGreaterThan(0.99);
  });

  it("matches the arrival/clearance boundary probabilities implied by boundaryZScore", () => {
    // arrivalTimeMinutes and clearanceTimeMinutes are defined as peak +/-
    // boundaryZScore * sigma (default z=1.645, the Gaussian 5th/95th
    // percentiles) -- arrivalProbability should reproduce ~0.05 / ~0.95
    // at exactly those boundaries, since they're the same Gaussian.
    const forecast = computeTransportForecast(MONDEGO_REACH);
    expect(arrivalProbability(forecast.arrivalTimeMinutes, forecast)).toBeCloseTo(0.05, 2);
    expect(arrivalProbability(forecast.clearanceTimeMinutes, forecast)).toBeCloseTo(0.95, 2);
  });
});

describe("classifyWfdEcologicalStatus", () => {
  it("maps zero severity to the best class (High)", () => {
    expect(classifyWfdEcologicalStatus(0).eqrClass).toBe("High");
  });

  it("maps maximal severity to the worst class (Bad)", () => {
    expect(classifyWfdEcologicalStatus(1).eqrClass).toBe("Bad");
  });

  it("is monotonic: higher severity never produces a better class", () => {
    const classRank: Record<string, number> = { High: 4, Good: 3, Moderate: 2, Poor: 1, Bad: 0 };
    let previousRank = Infinity;
    for (let severity = 0; severity <= 1; severity += 0.05) {
      const rank = classRank[classifyWfdEcologicalStatus(severity).eqrClass]!;
      expect(rank).toBeLessThanOrEqual(previousRank);
      previousRank = rank;
    }
  });

  it("clamps out-of-range inputs instead of throwing", () => {
    expect(classifyWfdEcologicalStatus(-5).eqrClass).toBe("High");
    expect(classifyWfdEcologicalStatus(5).eqrClass).toBe("Bad");
  });
});
