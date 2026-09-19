library OahMondegoExposureRules version '1.0.0'

/*
 * Computable spatial-temporal exposure and antimicrobial-stewardship rules
 * for the OAH-Mondego case study.
 *
 * STATUS: authored, valid CQL expressing the SAME logic implemented
 * directly in TypeScript in ../cdsHooks/exposureEngine.ts and
 * ../cdsHooks/orderSelect.ts. It is NOT wired to a live CQL execution
 * engine in this demo (no cql-execution/cql-engine runtime is included) --
 * the running Express service evaluates the equivalent logic natively so
 * it doesn't depend on an engine that isn't deployed here. This library is
 * the computable, standards-native expression of the same decision logic,
 * for a real CDS platform (e.g. one running the HL7 CQL engine) to consume
 * directly against the RiskAssessment resources this service's
 * `/demo/forecast-bundle` endpoint already emits.
 */

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers

codesystem "LOINC": 'http://loinc.org'
codesystem "SNOMEDCT": 'http://snomed.info/sct'

code "GI Pathogens DNA/RNA Panel - Stool NAA": '82195-9' from "LOINC" display 'Gastrointestinal pathogens DNA and RNA panel - Stool by NAA with non-probe detection'
code "Leptospirosis (disorder)": '77377001' from "SNOMEDCT" display 'Leptospirosis (disorder)'

context Patient

/*
 * The most recent preliminary RiskAssessment predicting waterborne
 * exposure for this patient's location -- produced by
 * ../fhir/riskAssessment.ts::buildForecastRiskAssessment and exposed via
 * GET /demo/forecast-bundle.
 */
define "ForecastRiskAssessments":
  [RiskAssessment] R
    where R.status = 'preliminary'
      and exists (
        R.prediction P
          where P.outcome.coding.code contains "Leptospirosis (disorder)".code
      )

define "LatestForecast":
  Last(
    "ForecastRiskAssessments" R sort by occurrenceDateTime
  )

define "LatestPrediction":
  singleton from ("LatestForecast".prediction)

/*
 * "Now" falls inside the predicted arrival window (whenPeriod) but before
 * it starts -- i.e. the plume is inbound but not yet arrived.
 */
define "InPredictedExposureWindow":
  "LatestForecast" is not null
    and Now() < "LatestPrediction".whenPeriod."start"

/*
 * "Now" falls within [whenPeriod.start, whenPeriod.end] -- i.e. the
 * modeled contamination front is predicted to be passing this location
 * right now.
 */
define "InConfirmedExposureWindow":
  "LatestForecast" is not null
    and Now() >= "LatestPrediction".whenPeriod."start"
    and Now() <= "LatestPrediction".whenPeriod."end"

define "HasSevereBetaLactamAllergy":
  exists (
    [AllergyIntolerance] A
      where A.code.text contains 'Penicillin'
        and exists (A.reaction R where R.severity = 'severe')
  )

/*
 * Antimicrobial-stewardship trigger: within a confirmed exposure window,
 * with a draft/active medication order already present, and no
 * pathogen-identifying test ordered yet -- suggest pairing empiric therapy
 * with the GI pathogen panel so treatment can be de-escalated once a
 * specific organism is identified.
 */
define "HasGiPathogenPanelOrdered":
  exists (
    [ServiceRequest] S
      where S.code.coding.code contains "GI Pathogens DNA/RNA Panel - Stool NAA".code
  )

define "HasMedicationOrderDraft":
  exists ([MedicationRequest] M where M.status in { 'draft', 'active' })

define "RecommendGiPathogenPanel":
  "InConfirmedExposureWindow"
    and "HasMedicationOrderDraft"
    and not "HasGiPathogenPanelOrdered"
