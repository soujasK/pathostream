/**
 * In-memory per-station exposure state + evaluation, shared by the
 * patient-view and order-select CDS Hooks handlers.
 *
 * Deliberately simple/process-local (same caveat as the sibling Python
 * service's `_CatchmentStateCache`): fine for a single-process demo, not a
 * production multi-worker deployment.
 *
 * Mirrors the sibling Python service's three-way `handle_patient_view`
 * logic exactly (see `app/services/cds_service.py`): for a given station,
 * (1) if it's flagged itself, that's ground truth -- confirmed
 * immediately, no transport delay; (2) else, if a propagation forecast
 * from some OTHER currently-flagged upstream station targets it, evaluate
 * that forecast's predicted/confirmed/cleared phase; (3) else, nothing to
 * report.
 */

import { MONDEGO_FLOW_ORDER, MONDEGO_STATIONS } from "../data/mondegoNetwork.js";
import { arrivalProbability, type TransportForecast } from "../hydrology/advectionDispersion.js";
import {
  computeNetworkForecasts,
  type PropagationForecast,
  type StationPosition,
} from "../hydrology/propagation.js";
import { classifyWfdEcologicalStatus, type WfdClassification } from "../hydrology/wfdClassification.js";

export interface StationState {
  flagged: boolean;
  /** Contamination severity at this station, 0-1. */
  severityIndex: number;
  flaggedAt: Date | null;
}

const EMPTY_STATE: StationState = { flagged: false, severityIndex: 0, flaggedAt: null };

const stationStates = new Map<string, StationState>();

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function setStationState(
  stationId: string,
  flagged: boolean,
  severityIndex = 0.8,
  flaggedAt: Date = new Date(),
): StationState {
  const state: StationState = {
    flagged,
    severityIndex: flagged ? clamp01(severityIndex) : 0,
    flaggedAt: flagged ? flaggedAt : null,
  };
  stationStates.set(stationId, state);
  return { ...state };
}

export function getStationState(stationId: string): StationState {
  const state = stationStates.get(stationId);
  return state ? { ...state } : { ...EMPTY_STATE };
}

export function getAllStationStates(): Map<string, StationState> {
  return new Map(stationStates);
}

export function resetAllStations(): void {
  stationStates.clear();
}

function networkPositions(): Map<string, StationPosition> {
  const positions = new Map<string, StationPosition>();
  for (const station of MONDEGO_STATIONS) {
    positions.set(station.id, { stationId: station.id, latitude: station.latitude, longitude: station.longitude });
  }
  return positions;
}

function flaggedStationIds(): Set<string> {
  const ids = new Set<string>();
  for (const [stationId, state] of stationStates) {
    if (state.flagged) ids.add(stationId);
  }
  return ids;
}

/** All current downstream forecasts across the network -- for
 * `/demo/forecasts` and the FHIR forecast bundle. */
export function getActiveForecasts(dispersionCoefficientM2S?: number): PropagationForecast[] {
  const flagged = flaggedStationIds();
  if (flagged.size === 0) return [];
  // A single representative velocity is used network-wide (same
  // simplification as the flat dispersion-coefficient default -- see
  // advectionDispersion.ts); real per-segment calibration would vary
  // this by reach.
  const meanVelocityMs = 0.36;
  return computeNetworkForecasts(MONDEGO_FLOW_ORDER, networkPositions(), flagged, meanVelocityMs, dispersionCoefficientM2S);
}

export type ExposurePhase = "predicted" | "confirmed" | "cleared";

export interface StationExposureEvaluation {
  stationId: string;
  phase: ExposurePhase;
  /** True if this station's OWN state is flagged (ground truth) rather
   * than a downstream forecast traced back to another station. */
  isOwnFlag: boolean;
  /** The station whose flag this evaluation traces back to -- itself, if
   * `isOwnFlag`. */
  sourceStationId: string;
  wfd: WfdClassification;
  elapsedMinutes: number;
  /** P(exposure at this station) -- 1 for an own-flag (ground truth); the
   * transport model's Gaussian-CDF arrival probability (see
   * `arrivalProbability` in advectionDispersion.ts) for a downstream
   * forecast. */
  probability: number;
  /** Present only for a downstream-forecast evaluation (not an own-flag
   * one, which has no transport distance to speak of). */
  forecast?: TransportForecast;
}

export function evaluateStationExposure(stationId: string): StationExposureEvaluation | null {
  const own = stationStates.get(stationId);
  if (own?.flagged && own.flaggedAt) {
    const elapsedMinutes = (Date.now() - own.flaggedAt.getTime()) / 60_000;
    return {
      stationId,
      phase: "confirmed",
      isOwnFlag: true,
      sourceStationId: stationId,
      wfd: classifyWfdEcologicalStatus(own.severityIndex),
      elapsedMinutes,
      probability: 1,
    };
  }

  const flagged = flaggedStationIds();
  if (flagged.size === 0) return null;

  const forecasts = computeNetworkForecasts(MONDEGO_FLOW_ORDER, networkPositions(), flagged, 0.36);
  const forecast = forecasts.find((f) => f.targetStationId === stationId);
  if (!forecast) return null;

  const sourceState = stationStates.get(forecast.sourceStationId);
  if (!sourceState?.flaggedAt) return null;

  const elapsedMinutes = (Date.now() - sourceState.flaggedAt.getTime()) / 60_000;
  const transport = forecast.transport;

  let phase: ExposurePhase;
  if (elapsedMinutes < transport.arrivalTimeMinutes) {
    phase = "predicted";
  } else if (elapsedMinutes <= transport.clearanceTimeMinutes) {
    phase = "confirmed";
  } else {
    phase = "cleared";
  }

  return {
    stationId,
    phase,
    isOwnFlag: false,
    sourceStationId: forecast.sourceStationId,
    wfd: classifyWfdEcologicalStatus(sourceState.severityIndex),
    elapsedMinutes,
    probability: arrivalProbability(elapsedMinutes, transport),
    forecast: transport,
  };
}
