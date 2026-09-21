/**
 * HL7 Europe OneAquaHealth (OAH) FHIR IG conformance note -- read before
 * adding a `meta.profile` claim to anything this module emits.
 *
 * The real OAH IG exists (github.com/hl7-eu/oah; CI build at
 * build.fhir.org/ig/hl7-eu/oah) and is, as of this writing, an unballoted
 * CI-build draft, not a published standard. We independently confirmed one
 * real profile it defines, `.../StructureDefinition/observation-with-
 * component-oah` (an Observation profile). We could NOT independently
 * confirm a RiskAssessment-specific OAH profile exists in the IG, so
 * `buildForecastRiskAssessment` below therefore emits a plain
 * base-FHIR-R4-conformant RiskAssessment and does NOT set `meta.profile` to any OAH-specific RiskAssessment profile URL --
 * doing so would assert a conformance claim we couldn't verify.
 */

import type { NetworkStation } from "../data/mondegoNetwork.js";
import type { TransportForecast } from "../hydrology/advectionDispersion.js";
import type { WfdClassification } from "../hydrology/wfdClassification.js";
import type { CodeableConcept, Coding, Period, Reference, RiskAssessment } from "./types.js";

const SNOMED_SYSTEM = "http://snomed.info/sct";
const RISK_PROBABILITY_SYSTEM = "http://terminology.hl7.org/CodeSystem/risk-probability";

/** SNOMED CT 77377001 "Leptospirosis (disorder)" -- confirmed directly
 * against browser.ihtsdotools.org. Leptospirosis is a documented,
 * quantified flood-associated risk in Europe too (see METHODS.md §6),
 * not an import from elsewhere. */
const LEPTOSPIROSIS_CODING: Coding = {
  system: SNOMED_SYSTEM,
  code: "77377001",
  display: "Leptospirosis (disorder)",
};

function qualitativeRiskCode(probability: number): "high" | "moderate" | "low" {
  if (probability >= 0.7) return "high";
  if (probability >= 0.4) return "moderate";
  return "low";
}

export interface RiskAssessmentInput {
  source: NetworkStation;
  target: NetworkStation;
  forecast: TransportForecast;
  wfd: WfdClassification;
  meanVelocityMs: number;
  /** The modeled chance, in [0,1], that the front has ALREADY reached the
   * target by `now` -- the Gaussian CDF of arrival time (see
   * `arrivalProbability` in advectionDispersion.ts). It starts near 0 at the
   * moment of the upstream event and rises toward 1 through the arrival
   * window; it is NOT the probability the arrival happens at all (the model
   * assumes it does), and not a calibrated statistical estimate. */
  probability: number;
  now?: Date;
}

/**
 * Builds one FHIR R4 RiskAssessment resource representing a PREDICTED
 * (not yet confirmed) downstream exposure risk between any two network
 * stations -- using the real `RiskAssessment.prediction.probabilityDecimal`
 * / `whenPeriod` elements -- the standards-conformant shape any consumer
 * of these forecasts (a hospital EHR, a cross-border alert exchange) can
 * read without knowing anything about this codebase.
 */
export function buildForecastRiskAssessment(input: RiskAssessmentInput): RiskAssessment {
  const { source, target, forecast, wfd, meanVelocityMs, probability } = input;
  const now = input.now ?? new Date();

  const subject: Reference = { reference: `Location/${target.id}`, display: target.name };
  const basis: Reference = { reference: `Location/${source.id}`, display: source.name };

  const outcome: CodeableConcept = {
    coding: [LEPTOSPIROSIS_CODING],
    text:
      `Predicted waterborne biohazard arrival at ${target.name}, propagated downstream from ` +
      `${source.name} (${forecast.distanceKm.toFixed(2)} km along the declared flow order).`,
  };

  const qualitativeRisk: CodeableConcept = {
    coding: [{ system: RISK_PROBABILITY_SYSTEM, code: qualitativeRiskCode(probability) }],
  };

  const arrival = new Date(now.getTime() + forecast.arrivalTimeMinutes * 60_000);
  const clearance = new Date(now.getTime() + forecast.clearanceTimeMinutes * 60_000);
  const whenPeriod: Period = { start: arrival.toISOString(), end: clearance.toISOString() };

  const rationale =
    `1D advection-dispersion (Taylor-dispersion / Fischer et al. approximation) transport model: peak arrival ` +
    `~${forecast.peakTimeMinutes.toFixed(1)} min, arrival window ${forecast.arrivalTimeMinutes.toFixed(1)}-` +
    `${forecast.clearanceTimeMinutes.toFixed(1)} min, over ${forecast.distanceKm.toFixed(2)} km at an assumed ` +
    `${meanVelocityMs} m/s mean velocity and ${forecast.dispersionCoefficientM2S} m^2/s dispersion ` +
    `coefficient -- both illustrative, NOT calibrated to a real gauge reading. Indicative WFD ` +
    `ecological status if this arrives unmitigated: ${wfd.eqrClass} (EQR ${wfd.indicativeEqr}, ${wfd.note}). ` +
    `Read probabilityDecimal together with whenPeriod: it is the modeled chance the front has already arrived at ` +
    `the time of this assessment (near 0 at first, rising through the window), not the chance it arrives at all.`;

  return {
    resourceType: "RiskAssessment",
    id: `forecast-risk-${source.id}-${target.id}`,
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
