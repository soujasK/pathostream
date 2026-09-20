/**
 * Per-station statistical early-warning state: wires `telemetryStream.ts`
 * (a synthetic noisy sensor signal) through `ewma.ts` (a real EWMA control
 * chart) for every network station, independent of and in addition to the
 * deterministic own-flag/downstream-forecast exposure engine in
 * `exposureEngine.ts`.
 *
 * Deliberately NOT fused into `exposureEngine.ts`'s `flagged` state or the
 * CDS Hooks cards it drives: this is a second, independent signal shown
 * alongside the first, not a replacement for it. See README's "Two
 * independent signals" note for why that fusion is left as documented
 * future work rather than done here.
 */

import { DOURO_STATIONS } from "../data/douroNetwork.js";
import { MONDEGO_STATIONS } from "../data/mondegoNetwork.js";
import { EwmaDetector, type EwmaResult } from "./ewma.js";
import { nextTurbidityReading, NORMAL_BASELINE, type RandomSource } from "./telemetryStream.js";

const MAX_HISTORY = 60;

/** Every network's stations share this one telemetry/detection registry,
 * keyed by station id -- safe because station ids are unique across
 * networks (Mondego is all `PT-*`; Douro mixes `ES-*`/`PT-*` with
 * different names), and it keeps this layer genuinely network-agnostic
 * rather than needing a second parallel copy per catchment. */
const ALL_STATIONS = [...MONDEGO_STATIONS, ...DOURO_STATIONS];

interface StationTelemetry {
  detector: EwmaDetector;
  tick: number;
  eventStartTick: number | null;
  history: EwmaResult[];
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
  return { detector: freshDetector(), tick: 0, eventStartTick: null, history: [] };
}

const stations = new Map<string, StationTelemetry>(ALL_STATIONS.map((s) => [s.id, freshStation()]));

export interface EarlyWarningState {
  stationId: string;
  tick: number;
  eventInjected: boolean;
  latest: EwmaResult | null;
  history: EwmaResult[];
}

function toState(stationId: string, station: StationTelemetry): EarlyWarningState {
  return {
    stationId,
    tick: station.tick,
    eventInjected: station.eventStartTick !== null,
    latest: station.history.at(-1) ?? null,
    history: [...station.history],
  };
}

/** Advance every station's telemetry by one sample and re-evaluate its
 * EWMA detector. `rng` is injectable for deterministic tests; production
 * callers use the default `Math.random`. */
export function advanceAllStations(rng: RandomSource = Math.random): EarlyWarningState[] {
  const results: EarlyWarningState[] = [];
  for (const [stationId, station] of stations) {
    station.tick += 1;
    const reading = nextTurbidityReading(station.tick, station.eventStartTick, rng);
    const result = station.detector.update(reading);
    station.history.push(result);
    if (station.history.length > MAX_HISTORY) station.history.shift();
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
