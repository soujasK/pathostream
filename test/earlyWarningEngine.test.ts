import { beforeEach, describe, expect, it } from "vitest";
import { MONDEGO_STATIONS } from "../src/data/mondegoNetwork.js";
import {
  advanceAllStations,
  clearTelemetryEvent,
  getAllEarlyWarningStates,
  getEarlyWarningState,
  injectTelemetryEvent,
  resetAllTelemetry,
} from "../src/analytics/earlyWarningEngine.js";

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STATION_A = MONDEGO_STATIONS[0]!.id;
const STATION_B = MONDEGO_STATIONS[1]!.id;

describe("earlyWarningEngine", () => {
  beforeEach(() => {
    resetAllTelemetry();
  });

  it("starts every station with no history and no injected event", () => {
    const states = getAllEarlyWarningStates();
    expect(states).toHaveLength(MONDEGO_STATIONS.length);
    for (const state of states) {
      expect(state.eventInjected).toBe(false);
      expect(state.latest).toBeNull();
    }
  });

  it("advanceAllStations grows every station's history by one per call", () => {
    const rng = mulberry32(10);
    advanceAllStations(rng);
    advanceAllStations(rng);
    const state = getEarlyWarningState(STATION_A);
    expect(state?.tick).toBe(2);
    expect(state?.history).toHaveLength(2);
  });

  it("stays in control for an unflagged station across many ticks", () => {
    const rng = mulberry32(11);
    for (let i = 0; i < 100; i++) advanceAllStations(rng);
    const state = getEarlyWarningState(STATION_A);
    expect(state?.latest?.outOfControl).toBe(false);
  });

  it("detects an injected contamination event within a bounded number of ticks, and only at the injected station", () => {
    const rng = mulberry32(12);
    for (let i = 0; i < 20; i++) advanceAllStations(rng);
    injectTelemetryEvent(STATION_A);

    let detectedTick = -1;
    for (let i = 0; i < 20; i++) {
      const results = advanceAllStations(rng);
      const a = results.find((r) => r.stationId === STATION_A)!;
      if (a.latest?.outOfControl && detectedTick === -1) detectedTick = a.tick;
    }

    expect(detectedTick).toBeGreaterThan(0);
    expect(detectedTick).toBeLessThan(40);

    const stationB = getEarlyWarningState(STATION_B);
    expect(stationB?.eventInjected).toBe(false);
    expect(stationB?.latest?.outOfControl).toBe(false);
  });

  it("injectTelemetryEvent throws for an unknown station", () => {
    expect(() => injectTelemetryEvent("NOT-A-REAL-STATION")).toThrow();
  });

  it("clearTelemetryEvent resets a station's detector and history", () => {
    const rng = mulberry32(13);
    injectTelemetryEvent(STATION_A);
    for (let i = 0; i < 10; i++) advanceAllStations(rng);
    clearTelemetryEvent(STATION_A);
    const state = getEarlyWarningState(STATION_A);
    expect(state?.eventInjected).toBe(false);
    expect(state?.tick).toBe(0);
    expect(state?.history).toHaveLength(0);
  });

  it("resetAllTelemetry clears every station back to its initial state", () => {
    const rng = mulberry32(14);
    injectTelemetryEvent(STATION_A);
    for (let i = 0; i < 5; i++) advanceAllStations(rng);
    resetAllTelemetry();
    for (const state of getAllEarlyWarningStates()) {
      expect(state.tick).toBe(0);
      expect(state.eventInjected).toBe(false);
    }
  });
});
