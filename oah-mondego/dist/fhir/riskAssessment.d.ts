import type { TransportForecast } from "../hydrology/advectionDispersion.js";
import type { WfdClassification } from "../hydrology/wfdClassification.js";
import type { ReachDefinition } from "../data/mondegoReach.js";
import type { RiskAssessment } from "./types.js";
export interface RiskAssessmentInput {
    reach: ReachDefinition;
    forecast: TransportForecast;
    wfd: WfdClassification;
    /** Probability in [0,1] that the predicted arrival materializes as an
     * actionable exposure -- an illustrative confidence score, not a
     * calibrated statistical estimate (see module docs in
     * hydrology/advectionDispersion.ts). */
    probability: number;
    now?: Date;
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
export declare function buildForecastRiskAssessment(input: RiskAssessmentInput): RiskAssessment;
