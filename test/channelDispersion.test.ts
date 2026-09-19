import { describe, expect, it } from "vitest";
import {
  estimateDispersionCoefficient,
  estimateShearVelocity,
  pecletNumber,
} from "../src/hydrology/channelDispersion.js";

describe("estimateShearVelocity", () => {
  it("matches a hand-computed example (U* = sqrt(g*H*S))", () => {
    // H=1m, S=0.001 -> U* = sqrt(9.80665 * 1 * 0.001) = 0.09903...
    expect(estimateShearVelocity(1, 0.001)).toBeCloseTo(0.09903, 4);
  });

  it("rejects non-positive inputs", () => {
    expect(() => estimateShearVelocity(0, 0.001)).toThrow();
    expect(() => estimateShearVelocity(1, 0)).toThrow();
  });
});

describe("estimateDispersionCoefficient (Fischer 1979 / Liu 1977)", () => {
  it("matches a hand-computed example", () => {
    // U=0.5 m/s, W=20m, H=1m, U*=0.05 m/s (supplied directly):
    // D_L = 0.011 * 0.5^2 * 20^2 / (1 * 0.05) = 0.011*0.25*400/0.05 = 22
    const result = estimateDispersionCoefficient({
      meanVelocityMs: 0.5,
      widthM: 20,
      depthM: 1,
      shearVelocityMs: 0.05,
    });
    expect(result).toBeCloseTo(22, 6);
  });

  it("derives shear velocity from slope when not supplied directly", () => {
    const viaSlope = estimateDispersionCoefficient({
      meanVelocityMs: 0.5,
      widthM: 20,
      depthM: 1,
      slope: 0.001,
    });
    const viaExplicitShear = estimateDispersionCoefficient({
      meanVelocityMs: 0.5,
      widthM: 20,
      depthM: 1,
      shearVelocityMs: estimateShearVelocity(1, 0.001),
    });
    expect(viaSlope).toBeCloseTo(viaExplicitShear, 10);
  });

  it("scales linearly with the beta correction factor", () => {
    const base = estimateDispersionCoefficient({ meanVelocityMs: 0.5, widthM: 20, depthM: 1, shearVelocityMs: 0.05 });
    const doubled = estimateDispersionCoefficient({
      meanVelocityMs: 0.5,
      widthM: 20,
      depthM: 1,
      shearVelocityMs: 0.05,
      betaCorrectionFactor: 2,
    });
    expect(doubled).toBeCloseTo(base * 2, 10);
  });

  it("requires either shearVelocityMs or slope", () => {
    expect(() => estimateDispersionCoefficient({ meanVelocityMs: 0.5, widthM: 20, depthM: 1 })).toThrow();
  });

  it("rejects non-positive geometry inputs", () => {
    expect(() =>
      estimateDispersionCoefficient({ meanVelocityMs: 0, widthM: 20, depthM: 1, shearVelocityMs: 0.05 }),
    ).toThrow();
    expect(() =>
      estimateDispersionCoefficient({ meanVelocityMs: 0.5, widthM: 0, depthM: 1, shearVelocityMs: 0.05 }),
    ).toThrow();
    expect(() =>
      estimateDispersionCoefficient({ meanVelocityMs: 0.5, widthM: 20, depthM: 0, shearVelocityMs: 0.05 }),
    ).toThrow();
  });
});

describe("pecletNumber", () => {
  it("matches a hand-computed example", () => {
    // Pe = u*L/D = 0.36 * 3850 / 8 = 173.25
    expect(pecletNumber(0.36, 3850, 8)).toBeCloseTo(173.25, 2);
  });

  it("rejects a non-positive dispersion coefficient", () => {
    expect(() => pecletNumber(0.36, 3850, 0)).toThrow();
  });
});
