/**
 * Citizen Intelligence Agent
 *
 * Summarises citizen reports in a catchment. Only reports a water-authority
 * reviewer has promoted count as corroboration -- an unreviewed submission
 * can prompt a ground investigation but never raise a severity
 * (SAFETY_CASE.md H13.1, H14).
 */

import { catchmentById } from "../data/catchments.js";
import { GeminiAgentRunner, renumber, useEvidence } from "./geminiClient.js";
import { citizenGrants } from "./toolGuard.js";
import type { AgentNarrative, AgentThoughtTrace, CitizenClusterAssessment } from "./types.js";

interface Phenomena {
  turbidOrMuddy: number;
  deadFish: number;
  chemicalOrSewageOdor: number;
  surfaceFoaming: number;
}

interface ClusterObservation {
  error?: string;
  totalReports: number;
  reviewedCount: number;
  phenomenaSummary: Phenomena;
  reviewedPhenomenaSummary: Phenomena;
}

function symptomsOf(p: Phenomena): string[] {
  const out: string[] = [];
  if (p.deadFish > 0) out.push("fish_mortality");
  if (p.chemicalOrSewageOdor > 0) out.push("sewage_odor");
  if (p.surfaceFoaming > 0) out.push("surface_foaming");
  if (p.turbidOrMuddy > 0) out.push("high_turbidity");
  return out;
}

export class CitizenIntelAgent {
  private runner: GeminiAgentRunner;

  constructor(runner?: GeminiAgentRunner) {
    this.runner = runner ?? new GeminiAgentRunner();
  }

  /**
   * @param sensorSignalActive whether the Sentinel sees a signal in this
   * catchment; omit for a standalone call, in which case corroboration is
   * reported as unknown (null) rather than guessed.
   */
  public async evaluateGroundTruth(catchmentId: string, sensorSignalActive?: boolean): Promise<{
    assessment: CitizenClusterAssessment;
    traces: AgentThoughtTrace[];
    narrative: AgentNarrative;
  }> {
    if (!catchmentById(catchmentId)) throw new Error(`Unknown catchment '${catchmentId}'`);

    const investigation = await this.runner.investigate({
      agentRole: "citizen_intel",
      systemInstruction:
        `You are the Citizen Intelligence Agent for PathoStream-EHR, reviewing public water-observation reports for catchment '${catchmentId}'. ` +
        "Only reports a water-authority reviewer has promoted count as corroboration.",
      prompt: "Count the reports by review status and phenomenon.",
      grants: citizenGrants(catchmentId),
      containsPatientData: false,
    });
    const traces: AgentThoughtTrace[] = [...investigation.traces];
    const obs = await useEvidence<ClusterObservation>(
      investigation,
      "evaluateCitizenCluster",
      { catchmentId },
      `Counting citizen reports in '${catchmentId}' by review status and phenomenon.`,
      traces,
    );
    if (obs.error) throw new Error(obs.error);

    const reportedVisualSymptoms = symptomsOf(obs.phenomenaSummary);
    const reviewedConcerning = obs.reviewedPhenomenaSummary.deadFish > 0 || obs.reviewedPhenomenaSummary.chemicalOrSewageOdor > 0;
    const correlatesWithPlume = sensorSignalActive === undefined ? null : sensorSignalActive && reviewedConcerning;
    const unreviewedCount = obs.totalReports - obs.reviewedCount;

    const assessment: CitizenClusterAssessment = {
      catchmentId,
      clusterCount: obs.totalReports,
      reviewedCount: obs.reviewedCount,
      unreviewedCount,
      reportedVisualSymptoms,
      correlatesWithPlume,
      // Investigating is the right response to unreviewed reports -- it is
      // how they get reviewed.
      priorityGroundInvestigationRecommended: obs.totalReports >= 2 || reportedVisualSymptoms.includes("fish_mortality"),
      rationale:
        `${obs.totalReports} report(s) in ${catchmentId}: ${obs.reviewedCount} reviewed and promoted by the water authority, ${unreviewedCount} not. ` +
        `Phenomena reported: ${reportedVisualSymptoms.join(", ") || "none"}. ` +
        "Only reviewed reports count as corroboration of a sensor signal.",
    };

    return { assessment, traces: renumber(traces), narrative: investigation.narrative };
  }
}
