/**
 * In-memory upstream-state + exposure-phase evaluation, shared by the
 * patient-view and order-select CDS Hooks handlers.
 *
 * Deliberately simple/process-local (same caveat as the sibling Python
 * service's `_CatchmentStateCache`): fine for a single-process demo, not a
 * production multi-worker deployment.
 */
import { MONDEGO_REACH } from "../data/mondegoReach.js";
import { computeTransportForecast } from "../hydrology/advectionDispersion.js";
import { classifyWfdEcologicalStatus } from "../hydrology/wfdClassification.js";
const state = { flagged: false, severityIndex: 0, flaggedAt: null };
export function setUpstreamState(flagged, severityIndex = 0.8, flaggedAt = new Date()) {
    state.flagged = flagged;
    state.severityIndex = flagged ? Math.min(1, Math.max(0, severityIndex)) : 0;
    state.flaggedAt = flagged ? flaggedAt : null;
    return { ...state };
}
export function getUpstreamState() {
    return { ...state };
}
export function resetUpstreamState() {
    state.flagged = false;
    state.severityIndex = 0;
    state.flaggedAt = null;
}
/** Returns null when the upstream station isn't currently flagged -- i.e.
 * "nothing to evaluate", the same silent-by-default posture as the
 * sibling Python service. */
export function evaluateExposure() {
    if (!state.flagged || !state.flaggedAt)
        return null;
    const forecast = computeTransportForecast({
        distanceKm: MONDEGO_REACH.distanceKm,
        meanVelocityMs: MONDEGO_REACH.meanVelocityMs,
    });
    const wfd = classifyWfdEcologicalStatus(state.severityIndex);
    const elapsedMinutes = (Date.now() - state.flaggedAt.getTime()) / 60_000;
    let phase;
    if (elapsedMinutes < forecast.arrivalTimeMinutes) {
        phase = "predicted";
    }
    else if (elapsedMinutes <= forecast.clearanceTimeMinutes) {
        phase = "confirmed";
    }
    else {
        phase = "cleared";
    }
    const probability = phase === "confirmed"
        ? Math.min(0.95, 0.5 + state.severityIndex * 0.45)
        : Math.min(0.85, 0.3 + state.severityIndex * 0.4);
    return { phase, forecast, wfd, elapsedMinutes, probability };
}
