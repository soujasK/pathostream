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
export type WfdEcologicalStatusClass = "High" | "Good" | "Moderate" | "Poor" | "Bad";
export interface WfdClassification {
    eqrClass: WfdEcologicalStatusClass;
    /** Indicative EQR-like ratio in [0,1], higher = better -- a PROXY, not an
     * official biological-quality-element EQR. */
    indicativeEqr: number;
    note: string;
}
/**
 * @param severityIndex A contamination-severity index in [0,1] (0 =
 *   undisturbed, 1 = maximally severe) -- e.g. a CCI-style score
 *   normalized against a local biohazard threshold.
 */
export declare function classifyWfdEcologicalStatus(severityIndex: number): WfdClassification;
