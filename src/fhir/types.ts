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

/** FHIR `Narrative`: a human-readable XHTML rendering of the resource.
 * Not required by the base resource, but the HL7 validator flags its
 * absence (dom-6, best practice) and an EHR that cannot render a
 * RiskAssessment's structured fields can still show this. */
export interface Narrative {
  status: "generated";
  div: string;
}

export interface RiskAssessment {
  resourceType: "RiskAssessment";
  id: string;
  text?: Narrative;
  status: "registered" | "preliminary" | "final" | "amended";
  subject: Reference;
  occurrenceDateTime: string;
  basis?: Reference[];
  prediction: RiskAssessmentPrediction[];
}
