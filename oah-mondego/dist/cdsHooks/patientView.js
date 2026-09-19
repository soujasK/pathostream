import { randomUUID } from "node:crypto";
import { MONDEGO_REACH } from "../data/mondegoReach.js";
import { evaluateExposure } from "./exposureEngine.js";
import { extractPatientAddress, haversineKm } from "./geolocation.js";
/** How close a patient's geocoded address must be to the downstream
 * station to be considered "in this monitored reach" at all. Illustrative
 * -- a real deployment would use a proper catchment polygon, same as the
 * sibling Python service's shapely-based CatchmentIndex, not a fixed
 * radius around one point. */
const NEAR_STATION_RADIUS_KM = 2.0;
const LOINC_SYSTEM = "http://loinc.org";
/** LOINC 82195-9 "Gastrointestinal pathogens DNA and RNA panel - Stool by
 * NAA with non-probe detection" -- verified against loinc.org (see
 * oah-mondego/README.md "Verified codes"). */
const GI_PATHOGEN_PCR_PANEL = { system: LOINC_SYSTEM, code: "82195-9" };
export function handlePatientView(request) {
    const patient = request.prefetch?.patient;
    const address = extractPatientAddress(patient);
    if (!address)
        return { cards: [] };
    const distance = haversineKm(address.latitude, address.longitude, MONDEGO_REACH.downstream.latitude, MONDEGO_REACH.downstream.longitude);
    if (distance > NEAR_STATION_RADIUS_KM)
        return { cards: [] };
    const evaluation = evaluateExposure();
    if (!evaluation || evaluation.phase === "cleared")
        return { cards: [] };
    const { forecast, wfd, phase, probability } = evaluation;
    if (phase === "predicted") {
        const card = {
            uuid: randomUUID(),
            summary: "Upstream waterborne contamination predicted to reach this address soon",
            indicator: "warning",
            detail: `${MONDEGO_REACH.upstream.name} currently shows an active biohazard signature. A 1D advection-` +
                `dispersion transport model (Taylor-dispersion approximation; ${forecast.distanceKm} km at an ` +
                `assumed ${MONDEGO_REACH.meanVelocityMs} m/s mean velocity -- illustrative, not a calibrated gauge ` +
                `reading) predicts the contamination front will reach ${MONDEGO_REACH.downstream.name} in an ` +
                `estimated ${forecast.arrivalTimeMinutes.toFixed(0)}-${forecast.clearanceTimeMinutes.toFixed(0)} ` +
                `minutes (peak ~${forecast.peakTimeMinutes.toFixed(0)} min), estimated probability ` +
                `${Math.round(probability * 100)}%. Indicative WFD ecological status if unmitigated: ${wfd.eqrClass} ` +
                `(${wfd.note}). No local confirmation yet -- this is a precautionary early-warning, not a confirmed ` +
                "exposure.",
            source: { label: "OAH-Mondego (downstream propagation forecast, deterministic)" },
            suggestions: [],
        };
        return { cards: [card] };
    }
    // phase === "confirmed": patient is within the predicted arrival window.
    const card = {
        uuid: randomUUID(),
        summary: "Active waterborne biohazard exposure window for this address",
        indicator: "critical",
        detail: `The predicted contamination front from ${MONDEGO_REACH.upstream.name} is now modeled to be passing ` +
            `${MONDEGO_REACH.downstream.name} (elapsed ~${evaluation.elapsedMinutes.toFixed(0)} min of a predicted ` +
            `${forecast.arrivalTimeMinutes.toFixed(0)}-${forecast.clearanceTimeMinutes.toFixed(0)} min window). ` +
            `Indicative WFD ecological status: ${wfd.eqrClass} (EQR ${wfd.indicativeEqr}). Consider empiric ` +
            "waterborne-exposure workup per institutional protocol; do not delay empiric therapy awaiting " +
            "confirmatory testing.",
        source: { label: "OAH-Mondego (deterministic exposure-window rule)" },
        suggestions: [
            {
                label: "Gastrointestinal pathogens DNA/RNA panel (stool NAA) -- LOINC 82195-9",
                uuid: randomUUID(),
                actions: [
                    {
                        type: "create",
                        description: "Order a stool-based multiplex GI pathogen NAA panel to identify the causative organism and " +
                            "support antimicrobial de-escalation once results return (antimicrobial stewardship).",
                        resource: {
                            resourceType: "ServiceRequest",
                            status: "draft",
                            intent: "order",
                            code: { coding: [GI_PATHOGEN_PCR_PANEL] },
                        },
                    },
                ],
            },
        ],
    };
    return { cards: [card] };
}
