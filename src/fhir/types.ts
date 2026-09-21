/**
 * Purpose-built FHIR R4 types -- deliberately not a general-purpose FHIR
 * library, just the handful of R4 elements this module actually emits,
 * each matching the real FHIR R4 JSON shape.
 */

export interface Coding {
  system: string;
  code: string;
  display?: string;
}

export interface CodeableConcept {
  coding: Coding[];
  text?: string;
}

export interface Reference {
  reference: string;
  display?: string;
}

export interface Period {
  start: string;
  end: string;
}

export interface RiskAssessmentPrediction {
  outcome: CodeableConcept;
  qualitativeRisk?: CodeableConcept;
  probabilityDecimal?: number;
  whenPeriod?: Period;
  rationale?: string;
}

export interface RiskAssessment {
  resourceType: "RiskAssessment";
  id: string;
  status: "registered" | "preliminary" | "final" | "amended";
  subject: Reference;
  occurrenceDateTime: string;
  basis?: Reference[];
  prediction: RiskAssessmentPrediction[];
}
