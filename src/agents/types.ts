/**
 * PathoStream-EHR Multi-Agent System Core Type Definitions
 *
 * Formal interfaces for the agents, their tools, the evidence traces they
 * record, and the consensus they produce.
 *
 * Safety posture (SAFETY_CASE.md H14): every number in an assessment comes
 * from a tool call whose arguments the agent fixed. A language model, when
 * one is configured, may choose which allowed tools to call (through the
 * guard in toolGuard.ts) and writes a narrative labelled as model-generated;
 * it never decides a number, a severity or an action. What
 * the agents produce is a PROPOSAL for a human: nothing here issues an
 * advisory or places an order.
 */

export type AgentRole = "sentinel" | "citizen_intel" | "clinical_triage" | "incident_commander";

/** What produced a piece of agent output. */
export type EngineProvenance = "live_llm" | "rule_based";

/** The one label used for "no language model was involved", everywhere
 * (runner results, /api/agents/status, the UI) -- so a rule-based run can
 * never be presented under a model's name. */
export const RULE_BASED_ENGINE_ID = "rule-based (no language model)";
/** Default model; override with OAH_GEMINI_MODEL or the runner's `model` option. */
export const LIVE_MODEL_ID = "gemini-2.5-flash";

export interface EngineInfo {
  provenance: EngineProvenance;
  /** The model id for a live call, RULE_BASED_ENGINE_ID otherwise. */
  engineId: string;
  /** Why a live model was NOT used, when one is configured but was skipped
   * or failed. */
  fallbackReason?: string | undefined;
}

export interface AgentThoughtTrace {
  agentRole: AgentRole;
  step: number;
  /** "deterministic_tool": a tool the agent ran with arguments it fixed;
   * "model_requested_tool": a tool the model asked for, run after the guard
   * checked and bound its arguments (toolGuard.ts); "rejected_tool_call": a
   * model request the guard refused (not executed); "language_model":
   * narrative text written by the model. */
  source: "deterministic_tool" | "model_requested_tool" | "rejected_tool_call" | "language_model";
  thought: string;
  action?: string | undefined;
  actionInput?: Record<string, unknown> | undefined;
  observation?: unknown | undefined;
  timestamp: string;
}

export interface AgentToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: "OBJECT";
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[] | undefined;
      items?: { type: string } | undefined;
    }>;
    required: string[];
  };
}

export interface AgentTool {
  declaration: AgentToolDeclaration;
  execute: (args: Record<string, unknown>) => Promise<unknown> | unknown;
}

/** A model-written summary, always carried with what produced it. `text` is
 * null when no model ran (rule-based output has no narrative). */
export interface AgentNarrative {
  agentRole: AgentRole;
  text: string | null;
  engine: EngineInfo;
  /** Tools the agent had to run itself because the model did not request
   * them with the needed arguments -- evidence the narrative did not see. */
  evidenceGapsFilled: string[];
}

export type ContaminantSeverity = "nominal" | "low" | "moderate" | "critical";

/** Where the evidence for a contamination signal comes from. A statistical
 * turbidity signal is inferred -- it never observed a pathogen (H2); only an
 * operator report or a water-authority-reviewed citizen report is
 * human-confirmed (H13.1). */
export type EvidenceBasis = "none" | "inferred_statistical" | "human_confirmed";

export type LikelyPathogen =
  | "Cryptosporidium parvum"
  | "Vibrio cholerae"
  | "Vibrio vulnificus"
  | "Campylobacter jejuni"
  | "Norovirus GI/GII"
  | "Microcystin Cyanotoxin (Algal Bloom)"
  | "Escherichia coli O157:H7 (STEC)"
  | "Leptospira interrogans (Leptospirosis)"
  | "Unknown Chemical / Biological Toxoid";

export interface SentinelAssessment {
  /** The station inspected, or null when the catchment as a whole was. */
  stationId: string | null;
  catchmentId: string;
  severity: ContaminantSeverity;
  /** Heuristic 0-1 index from the count of out-of-control stations; not a
   * calibrated probability. */
  anomalyScore: number;
  /** Latest reading, or null when the station has no telemetry yet. */
  turbidityNtu: number | null;
  /** Turbidity cannot identify a pathogen, so the classification only says
   * whether a signal exists and who, if anyone, confirmed it. */
  signalClassification: "no_data" | "within_control_limits" | "turbidity_anomaly_unconfirmed" | "human_confirmed_contamination";
  evidenceBasis: EvidenceBasis;
  /** Stations with an active flag, and who raised it. */
  flaggedStations: Array<{ stationId: string; confirmedVia: string }>;
  /** Illustrative network mean velocity (not calibrated), or null when no
   * simulation was run. */
  assumedMeanVelocityKmh: number | null;
  /** Peak-arrival estimate at the first downstream station with its 90%
   * band, or null when there is no signal to propagate. */
  downstreamArrivalEtaHours: number | null;
  downstreamArrivalBandHours: { low: number; high: number } | null;
  affectedDownstreamStations: string[];
  rationale: string;
}

export interface CitizenClusterAssessment {
  catchmentId: string;
  /** All submissions, reviewed or not. */
  clusterCount: number;
  /** Submissions a water-authority reviewer has promoted. Only these may
   * count as corroboration (H13.1). */
  reviewedCount: number;
  unreviewedCount: number;
  reportedVisualSymptoms: string[]; // e.g. ["fish_mortality", "surface_foaming"]
  /** Reviewed reports with concerning phenomena AND an active sensor signal.
   * Null when no sensor context was supplied (standalone call). */
  correlatesWithPlume: boolean | null;
  priorityGroundInvestigationRecommended: boolean;
  rationale: string;
}

export interface ClinicalTriageAssessment {
  patientId: string;
  /** A suggested review priority for the clinician, not a triage decision.
   * URGENT only when the patient is near a station with a human-confirmed
   * contamination signal whose front has arrived. */
  triagePriority: "ROUTINE" | "URGENT";
  nearestStation: { id: string; name: string; distanceKm: number; withinMonitoredRadius: boolean } | null;
  exposureStatus: "none" | "predicted" | "confirmed" | "cleared";
  exposureEvidenceBasis: EvidenceBasis;
  pathogenRankings: Array<{
    pathogen: LikelyPathogen;
    /** Hand-set 0-1 rank score from symptom keywords and incubation window.
     * NOT a probability or a confidence. */
    heuristicScore: number;
    /** Null when the exposure time is unknown. */
    incubationMatch: boolean | null;
    clinicalRationale: string;
  }>;
  recommendedDiagnostics: Array<{
    testName: string;
    /** Only codes verified against loinc.org are emitted (README "Verified
     * codes"); otherwise undefined. */
    loincCode?: string | undefined;
    clinicalJustification: string;
  }>;
  /** Considerations for the clinician, not orders. */
  protectiveMeasures: string[];
  waterExposureEvidenceSummary: string;
  clinicalDisclaimer: string;
  contraindicationsOrWarnings?: string[] | undefined;
  requiresClinicianReview: true;
}

export type ProposedContainmentAction =
  | "none"
  | "request_confirmatory_sampling"
  | "recreational_closure"
  | "boil_water_advisory";

export interface MultiAgentConsensus {
  incidentId: string;
  catchmentId: string;
  timestamp: string;
  overallSeverity: ContaminantSeverity;
  evidenceBasis: EvidenceBasis;
  sentinel: SentinelAssessment;
  citizenIntel: CitizenClusterAssessment;
  clinicalTriage?: ClinicalTriageAssessment | undefined;
  commanderDirective: {
    /** Always a draft: nothing here is issued or sent. */
    status: "draft_pending_authority_approval";
    proposedAction: ProposedContainmentAction;
    municipalAdvisory: string;
    ehrBroadcastAlert: string;
  };
  narratives: AgentNarrative[];
  traces: AgentThoughtTrace[];
  agentDebateLog: string[];
  requiresHumanReview: true;
  decisionSupportNotice: string;
}

export const DECISION_SUPPORT_NOTICE =
  "Research prototype on synthetic data; not a medical device. Every output here is a proposal for review by a qualified clinician or the competent public-health / water authority -- nothing is issued, sent or ordered automatically. The absence of a signal does not exclude exposure.";
