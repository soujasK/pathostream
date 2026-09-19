/**
 * EU Water Framework Directive (2000/60/EC) Ecological Quality Ratio (EQR)
 * classification.
 *
 * REAL vs ILLUSTRATIVE -- read before citing this as WFD-conformant:
 * the WFD's 5-class system (High / Good / Moderate / Poor / Bad, EQR in
 * [0,1] where 1.0 = undisturbed reference conditions) is real and
 * correctly represented below. What is NOT real: the specific numeric
 * boundaries. Official WFD boundary-setting is type-specific per
 * water-body category and requires a formal intercalibration exercise
 * against national reference conditions (in Portugal, run by APA --
 * Agencia Portuguesa do Ambiente) using real biological quality elements
 * (macroinvertebrates, diatoms, fish fauna), not a single contamination
 * index. This module maps an illustrative severity index onto the 5 class
 * names with linear, documented, tunable boundaries: a demonstration of
 * the FRAMEWORK's shape, not a conformant Portuguese WFD assessment.
 */
const ILLUSTRATIVE_NOTE = "Illustrative proxy mapping onto the real WFD 5-class EQR system -- NOT an official, " +
    "type-specific, intercalibrated Portuguese APA assessment.";
/** Boundaries between classes, in descending indicativeEqr order.
 * Documented, tunable illustrative defaults (not sourced from an official
 * Portuguese type-specific intercalibration). */
const CLASS_BOUNDARIES = [
    { minEqr: 0.8, eqrClass: "High" },
    { minEqr: 0.6, eqrClass: "Good" },
    { minEqr: 0.4, eqrClass: "Moderate" },
    { minEqr: 0.2, eqrClass: "Poor" },
    { minEqr: 0, eqrClass: "Bad" },
];
/**
 * @param severityIndex A contamination-severity index in [0,1] (0 =
 *   undisturbed, 1 = maximally severe) -- e.g. a CCI-style score
 *   normalized against a local biohazard threshold.
 */
export function classifyWfdEcologicalStatus(severityIndex) {
    const clamped = Math.min(1, Math.max(0, severityIndex));
    const indicativeEqr = Math.round((1 - clamped) * 100) / 100;
    const boundary = CLASS_BOUNDARIES.find((b) => indicativeEqr >= b.minEqr);
    const eqrClass = boundary ? boundary.eqrClass : "Bad";
    return { eqrClass, indicativeEqr, note: ILLUSTRATIVE_NOTE };
}
