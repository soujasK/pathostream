const SNOMED_SYSTEM = "http://snomed.info/sct";
const RISK_PROBABILITY_SYSTEM = "http://terminology.hl7.org/CodeSystem/risk-probability";
/** SNOMED CT 77377001 "Leptospirosis (disorder)" -- the same verified code
 * used by the sibling Python service's app/core/fhir_compiler.py (see that
 * file's terminology-correction notes). Leptospirosis is a globally
 * relevant waterborne zoonotic risk, not India-specific, so reusing the
 * same verified concept here is deliberate, not a copy-paste oversight. */
const LEPTOSPIROSIS_CODING = {
    system: SNOMED_SYSTEM,
    code: "77377001",
    display: "Leptospirosis (disorder)",
};
function qualitativeRiskCode(probability) {
    if (probability >= 0.7)
        return "high";
    if (probability >= 0.4)
        return "moderate";
    return "low";
}
/**
 * Builds one FHIR R4 RiskAssessment resource representing a PREDICTED
 * (not yet confirmed) downstream exposure risk -- using the real
 * `RiskAssessment.prediction.probabilityDecimal` / `whenPeriod` elements,
 * the same pattern implemented independently in the sibling Python
 * service's `app/core/fhir_compiler.py::compile_forecast_bundle`. Two
 * independent implementations producing the same standards-conformant
 * shape is the actual interoperability claim here.
 */
export function buildForecastRiskAssessment(input) {
    const { reach, forecast, wfd, probability } = input;
    const now = input.now ?? new Date();
    const subject = {
        reference: `Location/${reach.downstream.id}`,
        display: reach.downstream.name,
    };
    const basis = {
        reference: `Location/${reach.upstream.id}`,
        display: reach.upstream.name,
    };
    const outcome = {
        coding: [LEPTOSPIROSIS_CODING],
        text: `Predicted waterborne biohazard arrival at ${reach.downstream.name}, propagated downstream from ` +
            `${reach.upstream.name} (${forecast.distanceKm} km along the declared reach).`,
    };
    const qualitativeRisk = {
        coding: [{ system: RISK_PROBABILITY_SYSTEM, code: qualitativeRiskCode(probability) }],
    };
    const arrival = new Date(now.getTime() + forecast.arrivalTimeMinutes * 60_000);
    const clearance = new Date(now.getTime() + forecast.clearanceTimeMinutes * 60_000);
    const whenPeriod = { start: arrival.toISOString(), end: clearance.toISOString() };
    const rationale = `1D advection-dispersion (Taylor-dispersion / Fischer et al. approximation) transport model: peak arrival ` +
        `~${forecast.peakTimeMinutes.toFixed(1)} min, arrival window ${forecast.arrivalTimeMinutes.toFixed(1)}-` +
        `${forecast.clearanceTimeMinutes.toFixed(1)} min, over ${forecast.distanceKm} km at an assumed ` +
        `${reach.meanVelocityMs} m/s mean velocity and ${forecast.dispersionCoefficientM2S} m^2/s dispersion ` +
        `coefficient -- both illustrative, NOT calibrated to a real Mondego gauge reading. Indicative WFD ` +
        `ecological status if this arrives unmitigated: ${wfd.eqrClass} (EQR ${wfd.indicativeEqr}, ${wfd.note}).`;
    return {
        resourceType: "RiskAssessment",
        id: `forecast-risk-${reach.upstream.id}-${reach.downstream.id}`,
        status: "preliminary",
        subject,
        occurrenceDateTime: now.toISOString(),
        basis: [basis],
        prediction: [
            {
                outcome,
                qualitativeRisk,
                probabilityDecimal: Math.round(probability * 100) / 100,
                whenPeriod,
                rationale,
            },
        ],
    };
}
