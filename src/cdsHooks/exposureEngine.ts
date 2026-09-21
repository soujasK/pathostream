/**
 * Per-station exposure state + evaluation, generalized as a factory so
 * every river in the registry (data/catchments.ts) gets its own
 * independent, in-memory instance from the same logic -- deliberately simple/process-
 * local: fine for a single-process demo, not a production multi-worker
 * deployment.
 *
 * Three-way `evaluateStationExposure` logic: for a given station, (1) if
 * it's flagged itself, that's ground truth -- confirmed immediately, no
 * transport delay; (2) else, if a propagation forecast from some OTHER
 * currently-flagged upstream station targets it, evaluate that forecast's
 * predicted/confirmed/cleared phase; (3) else, nothing to report.
 *
 * The module-level exports below (`setStationState`, `evaluateStationExposure`,
 * etc.) are the Mondego network's engine instance, kept as named exports
 * for backward compatibility with every existing caller/test -- every other
 * river's instance is created in `catchmentEngines.ts` via the same
 * `createExposureEngine` factory.
 */

import { MONDEGO_FLOW_ORDER, MONDEGO_STATIONS, type NetworkStation } from "../data/mondegoNetwork.js";
import { arrivalProbability, type TransportForecast } from "../hydrology/advectionDispersion.js";
import {
  computeNetworkForecasts,
  type PropagationForecast,
  type StationPosition,
} from "../hydrology/propagation.js";
import { classifyWfdEcologicalStatus, type WfdClassification } from "../hydrology/wfdClassification.js";

/** How a station came to be flagged -- 'operator' for the demo's manual
 * "report confirmed contamination" testing control (the historical,
 * only source before the statistical layer existed), 'statistical-
 * detection' when the EWMA early-warning layer auto-escalated it after a
 * sustained anomaly (see earlyWarningEngine.ts's ESCALATION_THRESHOLD_TICKS).
 * Threaded through so the UI/incident log can tell a causal story instead
 * of an unexplained state flip. */
export type ConfirmationSource = "operator" | "statistical-detection";

export interface StationState {
  flagged: boolean;
  /** Contamination severity at this station, 0-1. */
  severityIndex: number;
  flaggedAt: Date | null;
  confirmedVia: ConfirmationSource;
}

const EMPTY_STATE: StationState = { flagged: false, severityIndex: 0, flaggedAt: null, confirmedVia: "operator" };

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
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
  /** Present only when `isOwnFlag` -- see `ConfirmationSource`. */
  confirmedVia?: ConfirmationSource;
}

export interface NetworkDefinition {
  catchmentId: string;
  stations: NetworkStation[];
  flowOrder: string[];
  /** Illustrative, documented network-wide mean velocity -- see the
   * relevant data module's docstring for why it isn't calibrated. */
  meanVelocityMs: number;
}

export interface ExposureEngine {
  setStationState(
    stationId: string,
    flagged: boolean,
    severityIndex?: number,
    flaggedAt?: Date,
    confirmedVia?: ConfirmationSource,
  ): StationState;
  getStationState(stationId: string): StationState;
  getAllStationStates(): Map<string, StationState>;
  resetAllStations(): void;
  getActiveForecasts(dispersionCoefficientM2S?: number): PropagationForecast[];
  evaluateStationExposure(stationId: string): StationExposureEvaluation | null;
}

/** Builds one independent exposure-engine instance (its own private
 * station-state map) bound to a given station network -- so two rivers
 * never share or collide on state, even if by coincidence they used the
 * same station id (they don't here: Mondego ids are `PT-*`, Douro ids mix
 * `ES-*`/`PT-*` with different names). */
export function createExposureEngine(network: NetworkDefinition): ExposureEngine {
  const stationStates = new Map<string, StationState>();

  function networkPositions(): Map<string, StationPosition> {
    const positions = new Map<string, StationPosition>();
    for (const station of network.stations) {
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

  function setStationState(
    stationId: string,
    flagged: boolean,
    severityIndex = 0.8,
    flaggedAt: Date = new Date(),
    confirmedVia: ConfirmationSource = "operator",
  ): StationState {
    const state: StationState = {
      flagged,
      severityIndex: flagged ? clamp01(severityIndex) : 0,
      flaggedAt: flagged ? flaggedAt : null,
      confirmedVia,
    };
    stationStates.set(stationId, state);
    return { ...state };
  }

  function getStationState(stationId: string): StationState {
    const state = stationStates.get(stationId);
    return state ? { ...state } : { ...EMPTY_STATE };
  }

  function getAllStationStates(): Map<string, StationState> {
    return new Map(stationStates);
  }

  function resetAllStations(): void {
    stationStates.clear();
  }

  function getActiveForecasts(dispersionCoefficientM2S?: number): PropagationForecast[] {
    const flagged = flaggedStationIds();
    if (flagged.size === 0) return [];
    return computeNetworkForecasts(
      network.flowOrder,
      networkPositions(),
      flagged,
      network.meanVelocityMs,
      dispersionCoefficientM2S,
    );
  }

  function evaluateStationExposure(stationId: string): StationExposureEvaluation | null {
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
        confirmedVia: own.confirmedVia,
      };
    }

    const flagged = flaggedStationIds();
    if (flagged.size === 0) return null;

    const forecasts = computeNetworkForecasts(network.flowOrder, networkPositions(), flagged, network.meanVelocityMs);
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

  return {
    setStationState,
    getStationState,
    getAllStationStates,
    resetAllStations,
    getActiveForecasts,
    evaluateStationExposure,
  };
}

export const mondegoEngine = createExposureEngine({
  catchmentId: "mondego-coimbra",
  stations: MONDEGO_STATIONS,
  flowOrder: MONDEGO_FLOW_ORDER,
  meanVelocityMs: 0.36,
});

export const setStationState = mondegoEngine.setStationState;
export const getStationState = mondegoEngine.getStationState;
export const getAllStationStates = mondegoEngine.getAllStationStates;
export const resetAllStations = mondegoEngine.resetAllStations;
export const getActiveForecasts = mondegoEngine.getActiveForecasts;
export const evaluateStationExposure = mondegoEngine.evaluateStationExposure;
