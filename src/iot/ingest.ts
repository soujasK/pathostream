/**
 * Real-device telemetry ingestion: the concrete, tested code path a
 * physical turbidity sensor (see IOT_ARCHITECTURE.md for the hardware and
 * network layers that would call it) would hit after its reading crosses a
 * LoRaWAN/NB-IoT gateway and a network server's HTTP webhook.
 *
 * Deliberately ISOLATED from the demo's synthetic per-station telemetry
 * (analytics/earlyWarningEngine.ts): a different in-memory map, a
 * different id space (arbitrary device ids, not the 33 registered station
 * ids), and nothing here is wired to any river's exposure engine or CDS
 * Hooks card. The two pipelines share only the same underlying, tested
 * building blocks (the real EWMA class and the Phase-I baseline gate) --
 * proving the detector works unchanged on an externally-supplied reading,
 * not claiming any station is now really monitored.
 */

import { AUTO_ESCALATION_SEVERITY, ESCALATION_THRESHOLD_TICKS, EWMA_L, EWMA_LAMBDA } from "../analytics/detectorConfig.js";
import { EwmaDetector, type EwmaResult } from "../analytics/ewma.js";
import { assessBaseline, type BaselineAssessment } from "../analytics/baseline.js";

export interface DeviceReading {
  /** The device's own clock, ISO 8601 -- kept alongside our receipt time
   * so clock drift or network delay is visible, not hidden. */
  measuredAt: string;
  /** Turbidity in NTU. */
  ntu: number;
  /** Optional device battery/signal telemetry a real LoRaWAN payload
   * commonly carries; recorded, not currently acted on. */
  batteryVolts?: number;
  rssiDbm?: number;
}

export type IngestResult =
  | { ok: true; ticksSinceBaselineSet: number; latest: EwmaResult; autoEscalated: boolean }
  | { ok: false; error: string };

interface DeviceState {
  /** Raw readings kept until a baseline is set (Phase-I window), then
   * discarded -- MIN_PHASE_ONE_READINGS-sized, not unbounded. */
  phaseOneReadings: number[];
  baseline: BaselineAssessment | null;
  detector: EwmaDetector | null;
  history: EwmaResult[];
  consecutiveOutOfControl: number;
  autoEscalated: boolean;
}

const MAX_HISTORY = 200;
const MAX_PHASE_ONE_BUFFER = 500; // assessBaseline() itself requires >= 200; cap so a misbehaving device can't grow this unboundedly

const devices = new Map<string, DeviceState>();

function freshDevice(): DeviceState {
  return { phaseOneReadings: [], baseline: null, detector: null, history: [], consecutiveOutOfControl: 0, autoEscalated: false };
}

function stateFor(deviceId: string): DeviceState {
  let state = devices.get(deviceId);
  if (!state) {
    state = freshDevice();
    devices.set(deviceId, state);
  }
  return state;
}

/** Feeds one real reading through: while the device has no accepted
 * baseline yet, readings accumulate (Phase-I) and every accumulation is
 * re-assessed by the same gate a real onboarding step would require
 * (analytics/baseline.ts) -- a device is never monitored on an
 * unassessed, unverified baseline. Once a baseline is accepted, every
 * further reading runs through a real EWMA chart built from THAT
 * baseline's own mean/sd (not the demo's fixed 15+-3 constant), with the
 * same k-consecutive escalation rule the demo uses. */
export function ingestReading(deviceId: string, reading: DeviceReading): IngestResult {
  if (!Number.isFinite(reading.ntu) || reading.ntu < 0) {
    return { ok: false, error: "ntu must be a finite, non-negative number" };
  }
  if (Number.isNaN(Date.parse(reading.measuredAt))) {
    return { ok: false, error: "measuredAt must be a parseable ISO 8601 timestamp" };
  }

  const state = stateFor(deviceId);

  if (!state.detector) {
    state.phaseOneReadings.push(reading.ntu);
    if (state.phaseOneReadings.length > MAX_PHASE_ONE_BUFFER) state.phaseOneReadings.shift();
    const assessment = assessBaseline(state.phaseOneReadings);
    state.baseline = assessment;
    if (!assessment.adequate) {
      return { ok: false, error: `baseline not yet adequate: ${assessment.problems.join("; ")}` };
    }
    state.detector = new EwmaDetector({ lambda: EWMA_LAMBDA, L: EWMA_L, targetMean: assessment.mean, targetStdDev: assessment.sd });
  }

  const result = state.detector.update(reading.ntu);
  state.history.push(result);
  if (state.history.length > MAX_HISTORY) state.history.shift();
  state.consecutiveOutOfControl = result.outOfControl ? state.consecutiveOutOfControl + 1 : 0;

  const justEscalated = state.consecutiveOutOfControl >= ESCALATION_THRESHOLD_TICKS && !state.autoEscalated;
  if (justEscalated) state.autoEscalated = true;

  return { ok: true, ticksSinceBaselineSet: state.history.length, latest: result, autoEscalated: state.autoEscalated };
}

export interface DeviceStateSummary {
  deviceId: string;
  baseline: BaselineAssessment | null;
  monitoring: boolean;
  readingsSinceBaseline: number;
  autoEscalated: boolean;
  latest: EwmaResult | null;
  history: EwmaResult[];
  /** Restated here, not imported by callers, so this module's summary is
   * self-describing without cross-referencing detectorConfig.ts. */
  escalationSeverityIfEscalated: number;
}

export function deviceState(deviceId: string): DeviceStateSummary | null {
  const state = devices.get(deviceId);
  if (!state) return null;
  return {
    deviceId,
    baseline: state.baseline,
    monitoring: state.detector !== null,
    readingsSinceBaseline: state.history.length,
    autoEscalated: state.autoEscalated,
    latest: state.history.at(-1) ?? null,
    history: [...state.history],
    escalationSeverityIfEscalated: AUTO_ESCALATION_SEVERITY,
  };
}

export function knownDeviceIds(): string[] {
  return [...devices.keys()];
}

/** Test-only: returns every device to its unconfigured, no-baseline state. */
export function resetAllDevices(): void {
  devices.clear();
}
