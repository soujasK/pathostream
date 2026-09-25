/**
 * Epidemic Incident Commander Agent (multi-agent orchestrator)
 *
 * Runs the Sentinel, Citizen Intel and (optionally) Clinical Triage agents
 * and combines their findings into a PROPOSED action. The proposal is a
 * draft for the competent authority: nothing is issued or sent
 * (SAFETY_CASE.md H14).
 *
 * The rules, in order:
 *  - An unconfirmed statistical signal can only ever propose confirmatory
 *    sampling (H2).
 *  - Only reviewed citizen reports, together with a sensor signal, can raise
 *    the severity (H13.1).
 *  - A single patient's assessment never changes a population-level action.
 */

import { CitizenIntelAgent } from "./citizenIntelAgent.js";
import { ClinicalTriageAgent, type PatientTriageInput } from "./clinicalTriageAgent.js";
import { GeminiAgentRunner } from "./geminiClient.js";
import { SentinelAgent } from "./sentinelAgent.js";
import { runTool } from "./tools.js";
import {
  DECISION_SUPPORT_NOTICE,
  type AgentNarrative,
  type AgentThoughtTrace,
  type ClinicalTriageAssessment,
  type ContaminantSeverity,
  type MultiAgentConsensus,
  type ProposedContainmentAction,
} from "./types.js";

export interface DeliberationRequest {
  catchmentId: string;
  stationId?: string | undefined;
  patientContext?: PatientTriageInput | undefined;
}

export class EpidemicCommanderAgent {
  private runner: GeminiAgentRunner;
  private sentinel: SentinelAgent;
  private citizenIntel: CitizenIntelAgent;
  private clinicalTriage: ClinicalTriageAgent;

  constructor(runner?: GeminiAgentRunner) {
    this.runner = runner ?? new GeminiAgentRunner();
    this.sentinel = new SentinelAgent(this.runner);
    this.citizenIntel = new CitizenIntelAgent(this.runner);
    this.clinicalTriage = new ClinicalTriageAgent(this.runner);
  }

  public async deliberate(request: DeliberationRequest): Promise<MultiAgentConsensus> {
    const incidentId = `INC-${Date.now().toString(36).toUpperCase()}`;
    const allTraces: AgentThoughtTrace[] = [];
    const narratives: AgentNarrative[] = [];
    const debateLog: string[] = [];
    const collect = (traces: AgentThoughtTrace[]): void => {
      for (const t of traces) allTraces.push({ ...t, step: allTraces.length + 1 });
    };

    // Step 1: Sentinel
    const sentinelResult = await this.sentinel.evaluateCatchment(request.catchmentId, request.stationId);
    const sentinel = sentinelResult.assessment;
    collect(sentinelResult.traces);
    narratives.push(sentinelResult.narrative);
    debateLog.push(
      `[SENTINEL] ${sentinel.signalClassification.replace(/_/g, " ")}; severity ${sentinel.severity}; ` +
        `turbidity ${sentinel.turbidityNtu === null ? "no data" : `${sentinel.turbidityNtu} NTU`}; ` +
        `downstream ETA ${sentinel.downstreamArrivalEtaHours === null ? "n/a" : `${sentinel.downstreamArrivalEtaHours} h (90% band ${sentinel.downstreamArrivalBandHours!.low}-${sentinel.downstreamArrivalBandHours!.high} h, illustrative velocity)`}.`,
    );

    // Step 2: Citizen Intel, with the sensor context it needs to judge corroboration
    const citizenResult = await this.citizenIntel.evaluateGroundTruth(request.catchmentId, sentinel.evidenceBasis !== "none");
    const citizen = citizenResult.assessment;
    collect(citizenResult.traces);
    narratives.push(citizenResult.narrative);
    debateLog.push(
      `[CITIZEN INTEL] ${citizen.clusterCount} report(s), ${citizen.reviewedCount} reviewed. ` +
        `Corroborates sensor signal: ${citizen.correlatesWithPlume ? "yes (reviewed reports)" : "no"}. ` +
        `Ground investigation ${citizen.priorityGroundInvestigationRecommended ? "recommended" : "not indicated"}.`,
    );

    // Step 3: Clinical Triage (informational; does not drive the population action)
    let clinicalAssessment: ClinicalTriageAssessment | undefined;
    if (request.patientContext) {
      const triageResult = await this.clinicalTriage.triagePatient(request.patientContext);
      clinicalAssessment = triageResult.assessment;
      collect(triageResult.traces);
      narratives.push(triageResult.narrative);
      const top = clinicalAssessment.pathogenRankings[0];
      debateLog.push(
        `[CLINICAL TRIAGE] Suggested review priority ${clinicalAssessment.triagePriority}; exposure ${clinicalAssessment.exposureStatus}. ` +
          `Top symptom match: ${top ? `${top.pathogen} (heuristic score ${top.heuristicScore})` : "none"}. ` +
          "A single patient does not change the population-level proposal.",
      );
    }

    // Step 4: Commander synthesis
    const evidenceBasis = sentinel.evidenceBasis;
    let overallSeverity: ContaminantSeverity = sentinel.severity;
    if (citizen.correlatesWithPlume && (overallSeverity === "nominal" || overallSeverity === "low")) {
      overallSeverity = "moderate";
    }

    let proposedAction: ProposedContainmentAction = "none";
    if (evidenceBasis === "inferred_statistical") {
      proposedAction = "request_confirmatory_sampling";
    } else if (evidenceBasis === "human_confirmed") {
      proposedAction = overallSeverity === "critical" ? "boil_water_advisory" : "recreational_closure";
    }

    const basisText = evidenceBasis === "human_confirmed"
      ? "a human-confirmed contamination report"
      : "an unconfirmed statistical turbidity signal (no pathogen measured)";
    const actionText = proposedAction.replace(/_/g, " ");

    if (proposedAction !== "none") {
      const draft = await runTool<{ noticeId: string }>(
        "incident_commander",
        "draftPublicHealthAdvisory",
        { catchmentId: request.catchmentId, severity: overallSeverity === "nominal" ? "low" : overallSeverity, advisoryType: proposedAction, evidenceBasis },
        "Preparing a DRAFT notice for authority review (not issued).",
        allTraces,
      );
      debateLog.push(`[COMMANDER] Draft notice ${draft.noticeId} prepared for authority review; not issued.`);
    }

    const municipalAdvisory = proposedAction === "none"
      ? `No action proposed for ${request.catchmentId}: no active signal. Routine surveillance continues.`
      : `PROPOSED -- NOT ISSUED: ${actionText} for ${request.catchmentId}, based on ${basisText}. Requires approval by the competent public-health / water authority.`;
    const ehrBroadcastAlert = proposedAction === "none"
      ? `No clinician notice proposed for ${request.catchmentId}.`
      : `PROPOSED CLINICIAN NOTICE -- NOT SENT: possible waterborne gastrointestinal risk in ${request.catchmentId} (${basisText}). ` +
        "Consider asking patients with acute gastroenteritis about drinking-water source and surface-water contact.";

    // Narrative only: the commander's model is granted no tools (drafting is
    // never offered to a model), and it sees population-level evidence only
    // -- the patient assessment stays out of this prompt.
    const summary = await this.runner.investigate({
      agentRole: "incident_commander",
      systemInstruction: "You are the Incident Commander Agent for PathoStream-EHR, summarising a multi-agent assessment for a public-health reviewer.",
      prompt: `Evidence (JSON): ${JSON.stringify({ sentinel, citizen, overallSeverity, evidenceBasis, proposedAction, status: "draft_pending_authority_approval" })}`,
      grants: [],
      containsPatientData: false,
    });
    narratives.push(summary.narrative);
    collect(summary.traces);

    debateLog.push(
      `[COMMANDER] Severity ${overallSeverity}; evidence ${evidenceBasis.replace(/_/g, " ")}; proposed action: ${actionText} (draft, pending authority approval).`,
    );

    return {
      incidentId,
      catchmentId: request.catchmentId,
      timestamp: new Date().toISOString(),
      overallSeverity,
      evidenceBasis,
      sentinel,
      citizenIntel: citizen,
      clinicalTriage: clinicalAssessment,
      commanderDirective: {
        status: "draft_pending_authority_approval",
        proposedAction,
        municipalAdvisory,
        ehrBroadcastAlert,
      },
      narratives,
      traces: allTraces,
      agentDebateLog: debateLog,
      requiresHumanReview: true,
      decisionSupportNotice: DECISION_SUPPORT_NOTICE,
    };
  }
}
