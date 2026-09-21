import { beforeEach, describe, expect, it } from "vitest";
import { douroEngine } from "../src/cdsHooks/douroExposureEngine.js";
import { mondegoEngine } from "../src/cdsHooks/exposureEngine.js";
import { DOURO_STATIONS } from "../src/data/douroNetwork.js";
import { MONDEGO_STATIONS } from "../src/data/mondegoNetwork.js";
import {
  advanceAllStations,
  AUTO_ESCALATION_SEVERITY,
  clearTelemetryEvent,
  ESCALATION_THRESHOLD_TICKS,
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
const DOURO_STATION = DOURO_STATIONS[0]!.id;

describe("earlyWarningEngine", () => {
  beforeEach(() => {
    resetAllTelemetry();
    mondegoEngine.resetAllStations();
    douroEngine.resetAllStations();
  });

  it("starts every station with no history and no injected event", () => {
    const states = getAllEarlyWarningStates();
    expect(states).toHaveLength(MONDEGO_STATIONS.length + DOURO_STATIONS.length);
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

describe("earlyWarningEngine auto-escalation (fused detection -> confirmation)", () => {
  beforeEach(() => {
    resetAllTelemetry();
    mondegoEngine.resetAllStations();
    douroEngine.resetAllStations();
  });

  it("does not escalate a Mondego station before ESCALATION_THRESHOLD_TICKS consecutive out-of-control ticks", () => {
    const rng = mulberry32(20);
    injectTelemetryEvent(STATION_A);
    for (let i = 0; i < ESCALATION_THRESHOLD_TICKS - 1; i++) advanceAllStations(rng);
    expect(mondegoEngine.getStationState(STATION_A).flagged).toBe(false);
  });

  it("auto-escalates a Mondego station to confirmed via its own exposure engine after sustained anomaly", () => {
    const rng = mulberry32(21);
    injectTelemetryEvent(STATION_A);
    let escalatedTick = -1;
    for (let i = 0; i < 30; i++) {
      const results = advanceAllStations(rng);
      const a = results.find((r) => r.stationId === STATION_A)!;
      if (a.autoEscalated && escalatedTick === -1) escalatedTick = a.tick;
    }
    expect(escalatedTick).toBeGreaterThan(0);

    const state = mondegoEngine.getStationState(STATION_A);
    expect(state.flagged).toBe(true);
    expect(state.confirmedVia).toBe("statistical-detection");
    expect(state.severityIndex).toBe(AUTO_ESCALATION_SEVERITY);

    const evaluation = mondegoEngine.evaluateStationExposure(STATION_A);
    expect(evaluation?.isOwnFlag).toBe(true);
    expect(evaluation?.confirmedVia).toBe("statistical-detection");
  });

  it("escalates a Douro station into the Douro engine, leaving Mondego untouched", () => {
    const rng = mulberry32(22);
    injectTelemetryEvent(DOURO_STATION);
    for (let i = 0; i < 30; i++) advanceAllStations(rng);

    expect(douroEngine.getStationState(DOURO_STATION).flagged).toBe(true);
    expect(douroEngine.getStationState(DOURO_STATION).confirmedVia).toBe("statistical-detection");
    expect(mondegoEngine.getAllStationStates().size).toBe(0);
  });

  it("does not reset flaggedAt on every subsequent out-of-control tick after escalating (elapsed time keeps advancing)", () => {
    const rng = mulberry32(23);
    injectTelemetryEvent(STATION_A);
    for (let i = 0; i < 30; i++) advanceAllStations(rng);
    const flaggedAtFirst = mondegoEngine.getStationState(STATION_A).flaggedAt;
    expect(flaggedAtFirst).not.toBeNull();

    for (let i = 0; i < 10; i++) advanceAllStations(rng);
    const flaggedAtLater = mondegoEngine.getStationState(STATION_A).flaggedAt;
    expect(flaggedAtLater?.getTime()).toBe(flaggedAtFirst?.getTime());
  });

  it("does not override an operator's manual report with a later auto-escalation", () => {
    const rng = mulberry32(24);
    const operatorTime = new Date(Date.now() - 60_000);
    mondegoEngine.setStationState(STATION_A, true, 0.9, operatorTime, "operator");
    injectTelemetryEvent(STATION_A);
    for (let i = 0; i < 30; i++) advanceAllStations(rng);

    const state = mondegoEngine.getStationState(STATION_A);
    expect(state.confirmedVia).toBe("operator");
    expect(state.flaggedAt?.getTime()).toBe(operatorTime.getTime());
  });
});
