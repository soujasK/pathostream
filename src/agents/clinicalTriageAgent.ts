/**
 * Clinical Epidemiologist & Triage Agent
 *
 * Checks a patient's recorded location against monitored stations and their
 * exposure state, ranks candidate waterborne pathogens from the symptoms,
 * and proposes considerations for the clinician. Nothing here is an order or
 * a diagnosis; unknowns are reported as unknown rather than defaulted
 * (SAFETY_CASE.md H2, H8, H14).
 */

import { NEAR_STATION_RADIUS_KM } from "../cdsHooks/patientView.js";
import { GeminiAgentRunner, renumber, useEvidence } from "./geminiClient.js";
import { clinicalGrants, patientEpidemiologyArgs, patientProximityArgs } from "./toolGuard.js";
import { GI_PANEL_LOINC, VERIFIED_LOINC_CODES } from "./tools.js";
import type {
  AgentNarrative,
  AgentThoughtTrace,
  ClinicalTriageAssessment,
  EvidenceBasis,
  LikelyPathogen,
} from "./types.js";

export interface PatientTriageInput {
  patientId: string;
  latitude: number;
  longitude: number;
  symptoms: string;
  exposureHoursAgo?: number | undefined;
  isImmunocompromised?: boolean | undefined;
}

interface ProximityObservation {
  nearestStation: { id: string; name: string; distanceKm: number; withinMonitoredRadius: boolean } | null;
  exposureStatus: ClinicalTriageAssessment["exposureStatus"];
  evidenceBasis: EvidenceBasis;
  confirmedVia?: string;
}

interface EpidemiologyObservation {
  differentialRankings: Array<{
    pathogen: LikelyPathogen;
    heuristicScore: number;
    incubationMatch: boolean | null;
    clinicalRationale: string;
    recommendedTest: string;
    loincCode?: string;
  }>;
  contraindicationsOrWarnings: string[];
}

export const CLINICAL_DISCLAIMER =
  "INVESTIGATIONAL DECISION SUPPORT, research prototype on synthetic data -- not a medical device. Considerations for a qualified clinician, not orders or a diagnosis. Pathogen scores are hand-set heuristics, not probabilities. The absence of an alert does not exclude unmonitored water exposure; definitive diagnosis requires laboratory confirmation. Do not delay indicated clinical care.";

function describeExposure(p: ProximityObservation): string {
  if (!p.nearestStation) return "No monitored station found.";
  const where = `Nearest monitored station: ${p.nearestStation.name} (${p.nearestStation.distanceKm} km, straight-line).`;
  if (!p.nearestStation.withinMonitoredRadius) {
    return `${where} This is outside the ${NEAR_STATION_RADIUS_KM} km monitored radius, so no river signal applies. The absence of an alert does not exclude exposure.`;
  }
  if (p.exposureStatus === "none") return `${where} No active contamination signal at this station.`;
  const basis = p.evidenceBasis === "human_confirmed"
    ? `confirmed by ${p.confirmedVia === "citizen-reported" ? "a water-authority-reviewed citizen report" : "an operator"}`
    : "inferred from a statistical turbidity signal only (unconfirmed; no pathogen measured)";
  return `${where} Exposure phase: ${p.exposureStatus}; the underlying flag was ${basis}.`;
}

export class ClinicalTriageAgent {
  private runner: GeminiAgentRunner;

  constructor(runner?: GeminiAgentRunner) {
    this.runner = runner ?? new GeminiAgentRunner();
  }

  public async triagePatient(input: PatientTriageInput): Promise<{
    assessment: ClinicalTriageAssessment;
    traces: AgentThoughtTrace[];
    narrative: AgentNarrative;
  }> {
    // The model sees no identifier, location or symptoms here: the tools bind
    // them server-side (toolGuard.clinicalGrants) and it only chooses to call
    // them. By default this does not run at all -- the tool results are
    // still patient data (H8).
    const investigation = await this.runner.investigate({
      agentRole: "clinical_triage",
      systemInstruction:
        "You are the Clinical Epidemiologist Agent for PathoStream-EHR, preparing decision-support evidence for a clinician about the patient in this consultation. " +
        "The patient's details are held by the system and supplied to the tools automatically.",
      prompt: "Check the patient's proximity to monitored river stations and match their symptoms against waterborne pathogens.",
      grants: clinicalGrants(input),
      containsPatientData: true,
    });
    const traces: AgentThoughtTrace[] = [...investigation.traces];

    const proximity = await useEvidence<ProximityObservation>(
      investigation,
      "queryPatientFHIRContext",
      patientProximityArgs(input),
      "Locating the nearest monitored station and its exposure state.",
      traces,
    );
    const epi = await useEvidence<EpidemiologyObservation>(
      investigation,
      "matchPathogenEpidemiology",
      patientEpidemiologyArgs(input),
      "Ranking candidate waterborne pathogens from symptoms and exposure window.",
      traces,
    );

    const pathogenRankings = epi.differentialRankings.map((r) => ({
      pathogen: r.pathogen,
      heuristicScore: r.heuristicScore,
      incubationMatch: r.incubationMatch,
      clinicalRationale: r.clinicalRationale,
    }));

    // URGENT review only for a human-confirmed signal whose front has
    // arrived at the patient's station; an inferred signal or a forecast
    // that has not arrived stays ROUTINE, with the reason stated (H2).
    const triagePriority: ClinicalTriageAssessment["triagePriority"] =
      proximity.exposureStatus === "confirmed" && proximity.evidenceBasis === "human_confirmed" ? "URGENT" : "ROUTINE";

    const recommendedDiagnostics: ClinicalTriageAssessment["recommendedDiagnostics"] = [];
    for (const r of epi.differentialRankings.slice(0, 3)) {
      if (recommendedDiagnostics.some((d) => d.testName === r.recommendedTest)) continue;
      recommendedDiagnostics.push({
        testName: r.recommendedTest,
        loincCode: r.loincCode && VERIFIED_LOINC_CODES.has(r.loincCode) ? r.loincCode : undefined,
        clinicalJustification: r.clinicalRationale,
      });
    }
    const enteric = /diarrh|stool|cramp|vomit/.test(input.symptoms.toLowerCase());
    if (enteric && !recommendedDiagnostics.some((d) => d.loincCode === GI_PANEL_LOINC)) {
      recommendedDiagnostics.push({
        testName: "Gastrointestinal pathogens DNA and RNA panel - Stool PCR",
        loincCode: GI_PANEL_LOINC,
        clinicalJustification: "Broad molecular detection of common waterborne enteric protozoa, bacteria and viruses.",
      });
    }

    const protectiveMeasures: string[] = [];
    if (enteric) {
      protectiveMeasures.push("Consider enteric contact precautions");
      protectiveMeasures.push("Assess hydration status and replace fluids as clinically indicated");
    }
    if (proximity.exposureStatus !== "none") {
      protectiveMeasures.push("Ask about drinking-water source and recent surface-water contact");
    }
    protectiveMeasures.push("Record the patient's drinking-water source in the EHR");

    const topPathogen = pathogenRankings[0];
    const assessment: ClinicalTriageAssessment = {
      patientId: input.patientId,
      triagePriority,
      nearestStation: proximity.nearestStation,
      exposureStatus: proximity.exposureStatus,
      exposureEvidenceBasis: proximity.evidenceBasis,
      pathogenRankings,
      recommendedDiagnostics,
      protectiveMeasures,
      waterExposureEvidenceSummary:
        `${describeExposure(proximity)} ` +
        (topPathogen
          ? `Top symptom match: ${topPathogen.pathogen} (heuristic rank score ${topPathogen.heuristicScore}, not a probability).`
          : "No waterborne pathogen pattern matched the recorded symptoms."),
      contraindicationsOrWarnings: epi.contraindicationsOrWarnings.length > 0 ? epi.contraindicationsOrWarnings : undefined,
      clinicalDisclaimer: CLINICAL_DISCLAIMER,
      requiresClinicianReview: true,
    };

    return { assessment, traces: renumber(traces), narrative: investigation.narrative };
  }
}
