/**
 * In-memory upstream-state + exposure-phase evaluation, shared by the
 * patient-view and order-select CDS Hooks handlers.
 *
 * Deliberately simple/process-local (same caveat as the sibling Python
 * service's `_CatchmentStateCache`): fine for a single-process demo, not a
 * production multi-worker deployment.
 */
import { type TransportForecast } from "../hydrology/advectionDispersion.js";
import { type WfdClassification } from "../hydrology/wfdClassification.js";
export interface UpstreamState {
    flagged: boolean;
    /** Contamination severity at the upstream station, 0-1. */
    severityIndex: number;
    flaggedAt: Date | null;
}
export declare function setUpstreamState(flagged: boolean, severityIndex?: number, flaggedAt?: Date): UpstreamState;
export declare function getUpstreamState(): UpstreamState;
export declare function resetUpstreamState(): void;
export type ExposurePhase = "predicted" | "confirmed" | "cleared";
export interface ExposureEvaluation {
    phase: ExposurePhase;
    forecast: TransportForecast;
    wfd: WfdClassification;
    elapsedMinutes: number;
    /** Illustrative confidence score, not a calibrated statistical estimate. */
    probability: number;
}
/** Returns null when the upstream station isn't currently flagged -- i.e.
 * "nothing to evaluate", the same silent-by-default posture as the
 * sibling Python service. */
export declare function evaluateExposure(): ExposureEvaluation | null;
