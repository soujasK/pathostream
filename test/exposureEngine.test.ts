import { beforeEach, describe, expect, it } from "vitest";
import {
  evaluateStationExposure,
  resetAllStations,
  setStationState,
} from "../src/cdsHooks/exposureEngine.js";
import { MONDEGO_FLOW_ORDER, MONDEGO_STATIONS } from "../src/data/mondegoNetwork.js";
import { computeNetworkForecasts, type StationPosition } from "../src/hydrology/propagation.js";

const SOURCE_ID = MONDEGO_STATIONS[0]!.id; // Ponte de Santa Clara (most upstream)
const TARGET_ID = MONDEGO_STATIONS[2]!.id; // Parque Verde do Mondego (two hops downstream)

const positions = new Map<string, StationPosition>(
  MONDEGO_STATIONS.map((s) => [s.id, { stationId: s.id, latitude: s.latitude, longitude: s.longitude }]),
);

// The exact same forecast evaluateStationExposure computes internally --
// used here only to derive realistic arrival/clearance boundary offsets
// for the test scenarios below, not duplicated logic under test. Must
// pick the forecast whose target is specifically TARGET_ID (Parque Verde
// do Mondego is two hops downstream, not the nearest one) rather than
// assuming array order.
const forecasts = computeNetworkForecasts(MONDEGO_FLOW_ORDER, positions, new Set([SOURCE_ID]), 0.36);
const transport = forecasts.find((f) => f.targetStationId === TARGET_ID)!.transport;

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60_000);
}

beforeEach(() => {
  resetAllStations();
});

describe("evaluateStationExposure -- own-flag (ground truth)", () => {
  it("returns null for a station that has never been flagged", () => {
    expect(evaluateStationExposure(TARGET_ID)).toBeNull();
  });

  it("returns null after resetAllStations clears an active flag", () => {
    setStationState(TARGET_ID, true, 0.9);
    resetAllStations();
    expect(evaluateStationExposure(TARGET_ID)).toBeNull();
  });

  it("is immediately 'confirmed' for a station flagged directly (no transport delay)", () => {
    setStationState(TARGET_ID, true, 0.9);
    const evaluation = evaluateStationExposure(TARGET_ID)!;
    expect(evaluation.phase).toBe("confirmed");
    expect(evaluation.isOwnFlag).toBe(true);
    expect(evaluation.sourceStationId).toBe(TARGET_ID);
    expect(evaluation.probability).toBe(1);
  });
});

describe("evaluateStationExposure -- downstream propagation forecast", () => {
  it("is 'predicted' immediately after the upstream source is flagged (elapsed ~0)", () => {
    setStationState(SOURCE_ID, true, 0.9, minutesAgo(0));
    const evaluation = evaluateStationExposure(TARGET_ID)!;
    expect(evaluation.phase).toBe("predicted");
    expect(evaluation.isOwnFlag).toBe(false);
    expect(evaluation.sourceStationId).toBe(SOURCE_ID);
  });

  it("is 'predicted' right up to (but not past) the arrival boundary", () => {
    setStationState(SOURCE_ID, true, 0.9, minutesAgo(transport.arrivalTimeMinutes - 1));
    expect(evaluateStationExposure(TARGET_ID)?.phase).toBe("predicted");
  });

  it("is 'confirmed' once elapsed time crosses the arrival boundary", () => {
    setStationState(SOURCE_ID, true, 0.9, minutesAgo(transport.arrivalTimeMinutes + 1));
    expect(evaluateStationExposure(TARGET_ID)?.phase).toBe("confirmed");
  });

  it("is 'cleared' once elapsed time passes the clearance boundary", () => {
    setStationState(SOURCE_ID, true, 0.9, minutesAgo(transport.clearanceTimeMinutes + 1));
    expect(evaluateStationExposure(TARGET_ID)?.phase).toBe("cleared");
  });

  it("reports higher probability when confirmed than when merely predicted, all else equal", () => {
    setStationState(SOURCE_ID, true, 0.9, minutesAgo(0));
    const predicted = evaluateStationExposure(TARGET_ID)!;
    resetAllStations();
    setStationState(SOURCE_ID, true, 0.9, minutesAgo(transport.arrivalTimeMinutes + 1));
    const confirmed = evaluateStationExposure(TARGET_ID)!;

    expect(confirmed.probability).toBeGreaterThan(predicted.probability);
  });

  it("does not report exposure for a station upstream of the flagged one", () => {
    // TARGET_ID is downstream of SOURCE_ID -- flagging TARGET_ID must not
    // produce a forecast for the (upstream) SOURCE_ID.
    setStationState(TARGET_ID, true, 0.9, minutesAgo(0));
    const evaluation = evaluateStationExposure(SOURCE_ID);
    expect(evaluation).toBeNull();
  });

  it("clamps severityIndex into [0,1] rather than propagating an out-of-range value", () => {
    setStationState(SOURCE_ID, true, 5, minutesAgo(0));
    const evaluation = evaluateStationExposure(TARGET_ID)!;
    expect(evaluation.wfd.indicativeEqr).toBeGreaterThanOrEqual(0);
    expect(evaluation.wfd.eqrClass).toBe("Bad"); // severity clamped to 1 -> worst class
  });
});
