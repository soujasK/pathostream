/**
 * Per-station statistical early-warning state: wires `telemetryStream.ts`
 * (a synthetic noisy sensor signal) through `ewma.ts` (a real EWMA control
 * chart) for every network station.
 *
 * FUSED with `exposureEngine.ts`'s `flagged` state, deliberately with a
 * conservative, documented rule rather than an immediate one: a station
 * that stays statistically out-of-control for ESCALATION_THRESHOLD_TICKS
 * *consecutive* ticks is auto-escalated to a confirmed exposure via its
 * network's exposure engine (`ConfirmationSource: 'statistical-
 * detection'`, distinct from an operator's manual report) -- mirroring a
 * real water-quality lab's practice of requiring a sustained run of
 * out-of-control readings, not a single noisy sample, before escalating.
 * This turns "anomaly detected" and "confirmed contamination" into one
 * causal chain (detection -> escalation -> downstream forecast -> CDS
 * Hooks alert) instead of two disconnected signals -- see README's "One
 * causal chain" section.
 */

import { engineForStation } from "../cdsHooks/catchmentEngines.js";
import { ALL_STATIONS } from "../data/catchments.js";
import { EwmaDetector, type EwmaResult } from "./ewma.js";
import { nextTurbidityReading, NORMAL_BASELINE, type RandomSource } from "./telemetryStream.js";

const MAX_HISTORY = 60;

/** A station must be statistically out-of-control for this many
 * *consecutive* ticks before it is auto-escalated -- long enough that a
 * single noisy sample can't trigger it (the false-alarm tests in
 * ewma.test.ts show that's rare but not impossible over many ticks), and
 * still fast against the ~1.2s/tick demo clock (5 ticks is ~6s). */
export const ESCALATION_THRESHOLD_TICKS = 5;

/** Severity assigned to an auto-escalated confirmation -- a fixed,
 * documented value distinct from an operator's default 0.9 (a human
 * directly reporting ground truth), since this is inferred from a
 * statistical signal rather than observed directly. */
export const AUTO_ESCALATION_SEVERITY = 0.7;

/** Every river's stations share this one telemetry/detection registry,
 * keyed by station id -- safe because the catchment registry
 * (`data/catchments.ts`) refuses to load if two rivers share an id, and it
 * keeps this layer genuinely network-agnostic. Escalation is routed to
 * whichever river's exposure engine owns the station
 * (`engineForStation`). */
interface StationTelemetry {
  detector: EwmaDetector;
  tick: number;
  eventStartTick: number | null;
  history: EwmaResult[];
  consecutiveOutOfControl: number;
  autoEscalated: boolean;
}

function freshDetector(): EwmaDetector {
  return new EwmaDetector({
    lambda: 0.25,
    L: 3,
    targetMean: NORMAL_BASELINE.meanNtu,
    targetStdDev: NORMAL_BASELINE.stdDevNtu,
  });
}

function freshStation(): StationTelemetry {
  return {
    detector: freshDetector(),
    tick: 0,
    eventStartTick: null,
    history: [],
    consecutiveOutOfControl: 0,
    autoEscalated: false,
  };
}

const stations = new Map<string, StationTelemetry>(ALL_STATIONS.map((s) => [s.id, freshStation()]));

export interface EarlyWarningState {
  stationId: string;
  tick: number;
  eventInjected: boolean;
  latest: EwmaResult | null;
  history: EwmaResult[];
  autoEscalated: boolean;
}

function toState(stationId: string, station: StationTelemetry): EarlyWarningState {
  return {
    stationId,
    tick: station.tick,
    eventInjected: station.eventStartTick !== null,
    latest: station.history.at(-1) ?? null,
    history: [...station.history],
    autoEscalated: station.autoEscalated,
  };
}

/** Advance every station's telemetry by one sample, re-evaluate its EWMA
 * detector, and auto-escalate to a confirmed exposure (via that station's
 * own network exposure engine) if it has now been out-of-control for
 * ESCALATION_THRESHOLD_TICKS consecutive ticks and isn't already flagged.
 * `rng` is injectable for deterministic tests; production callers use the
 * default `Math.random`. */
export function advanceAllStations(rng: RandomSource = Math.random): EarlyWarningState[] {
  const results: EarlyWarningState[] = [];
  for (const [stationId, station] of stations) {
    station.tick += 1;
    const reading = nextTurbidityReading(station.tick, station.eventStartTick, rng);
    const result = station.detector.update(reading);
    station.history.push(result);
    if (station.history.length > MAX_HISTORY) station.history.shift();

    station.consecutiveOutOfControl = result.outOfControl ? station.consecutiveOutOfControl + 1 : 0;

    const engine = engineForStation(stationId);
    if (
      station.consecutiveOutOfControl >= ESCALATION_THRESHOLD_TICKS &&
      !station.autoEscalated &&
      engine &&
      !engine.getStationState(stationId).flagged
    ) {
      station.autoEscalated = true;
      engine.setStationState(stationId, true, AUTO_ESCALATION_SEVERITY, new Date(), "statistical-detection");
    }

    results.push(toState(stationId, station));
  }
  return results;
}

/** Marks a sustained contamination mean-shift as starting from the NEXT
 * tick onward for this station -- modeling a real event's onset, not
 * forcing an immediate detector alarm (the whole point is that detection
 * takes a few samples, same as a real EWMA chart). */
export function injectTelemetryEvent(stationId: string): void {
  const station = stations.get(stationId);
  if (!station) throw new Error(`Unknown stationId '${stationId}'`);
  station.eventStartTick = station.tick + 1;
}

export function clearTelemetryEvent(stationId: string): void {
  const station = stations.get(stationId);
  if (!station) throw new Error(`Unknown stationId '${stationId}'`);
  station.eventStartTick = null;
  station.detector.reset();
  station.history = [];
  station.tick = 0;
  station.consecutiveOutOfControl = 0;
  station.autoEscalated = false;
}

export function getEarlyWarningState(stationId: string): EarlyWarningState | null {
  const station = stations.get(stationId);
  return station ? toState(stationId, station) : null;
}

export function getAllEarlyWarningStates(): EarlyWarningState[] {
  return [...stations.entries()].map(([stationId, station]) => toState(stationId, station));
}

export function resetAllTelemetry(): void {
  for (const stationId of stations.keys()) {
    stations.set(stationId, freshStation());
  }
}

/** Resets telemetry for just one river's stations -- what a river's own
 * "Reset" must do, so an auto-escalation latch never outlives the flag it
 * created (otherwise the panel would keep saying "Escalated -> confirmed"
 * for a station the exposure engine has since cleared). */
export function resetTelemetryFor(stationIds: string[]): void {
  for (const stationId of stationIds) {
    if (stations.has(stationId)) stations.set(stationId, freshStation());
  }
}
