/**
 * Environmental Sentinel Agent
 *
 * Audits a catchment's telemetry and flags, and -- when there is a signal --
 * forecasts downstream arrival with the transport model. Turbidity alone
 * cannot identify a pathogen, so the agent only reports whether a signal
 * exists and who, if anyone, confirmed it (SAFETY_CASE.md H2, H14).
 */

import { catchmentById } from "../data/catchments.js";
import { GeminiAgentRunner, renumber, useEvidence } from "./geminiClient.js";
import { sentinelGrants } from "./toolGuard.js";
import { evidenceBasisOf } from "./tools.js";
import type {
  AgentNarrative,
  AgentThoughtTrace,
  ContaminantSeverity,
  EvidenceBasis,
  SentinelAssessment,
} from "./types.js";

interface TelemetryObservation {
  error?: string;
  stationsWithData: number;
  activeAnomaliesCount: number;
  anomalousStations: Array<{ stationId: string; turbidityNtu: number | null }>;
  flaggedStations: Array<{ stationId: string; confirmedVia: string }>;
  stations: Array<{ stationId: string; turbidityNtu: number | null; hasData: boolean }>;
}

interface SimulationObservation {
  error?: string;
  assumedMeanVelocityKmh: number;
  downstreamProjections: Array<{ stationId: string; expectedArrivalHours: number; earliestArrivalHours: number; latestArrivalHours: number }>;
}

export class SentinelAgent {
  private runner: GeminiAgentRunner;

  constructor(runner?: GeminiAgentRunner) {
    this.runner = runner ?? new GeminiAgentRunner();
  }

  public async evaluateCatchment(catchmentId: string, originStationId?: string): Promise<{
    assessment: SentinelAssessment;
    traces: AgentThoughtTrace[];
    narrative: AgentNarrative;
  }> {
    const catchment = catchmentById(catchmentId);
    if (!catchment) throw new Error(`Unknown catchment '${catchmentId}'`);
    if (originStationId !== undefined && !catchment.flowOrder.includes(originStationId)) {
      throw new Error(`Station '${originStationId}' is not in catchment '${catchmentId}'`);
    }

    const investigation = await this.runner.investigate({
      agentRole: "sentinel",
      systemInstruction:
        `You are the Environmental Sentinel Agent for PathoStream-EHR, investigating river catchment '${catchmentId}'` +
        (originStationId ? ` at station '${originStationId}'` : "") +
        ". Read the telemetry and flags; if there is a signal, forecast its downstream arrival from the station where it is.",
      prompt: `Station ids in flow order: ${catchment.flowOrder.join(", ")}.`,
      grants: sentinelGrants(catchmentId, originStationId),
      containsPatientData: false,
    });
    const traces: AgentThoughtTrace[] = [...investigation.traces];
    const telemetry = await useEvidence<TelemetryObservation>(
      investigation,
      "queryRiverTelemetry",
      { catchmentId, ...(originStationId ? { stationId: originStationId } : {}) },
      `Reading EWMA telemetry and active flags for '${catchmentId}'.`,
      traces,
    );
    if (telemetry.error) throw new Error(telemetry.error);

    // Flags are catchment-wide; restrict to the inspected station if one was given.
    const flagged = originStationId
      ? telemetry.flaggedStations.filter((f) => f.stationId === originStationId)
      : telemetry.flaggedStations;
    const humanConfirmed = flagged.filter((f) => evidenceBasisOf(f.confirmedVia) === "human_confirmed");
    const evidenceBasis: EvidenceBasis = humanConfirmed.length > 0
      ? "human_confirmed"
      : flagged.length > 0 || telemetry.activeAnomaliesCount > 0
      ? "inferred_statistical"
      : "none";

    // Heuristic index, documented as such in types.ts.
    const anomalyScore = telemetry.activeAnomaliesCount > 0 ? Math.min(0.95, 0.4 + telemetry.activeAnomaliesCount * 0.2) : 0;
    let severity: ContaminantSeverity = anomalyScore > 0.8 ? "critical" : anomalyScore > 0.5 ? "moderate" : anomalyScore > 0.2 ? "low" : "nominal";
    if (humanConfirmed.length > 0 && (severity === "nominal" || severity === "low")) severity = "moderate";

    const signalStation =
      originStationId ??
      humanConfirmed[0]?.stationId ??
      flagged[0]?.stationId ??
      telemetry.anomalousStations[0]?.stationId ??
      null;
    const turbidityNtu = signalStation
      ? telemetry.stations.find((s) => s.stationId === signalStation)?.turbidityNtu ?? null
      : null;

    let simulation: SimulationObservation | null = null;
    if (evidenceBasis !== "none" && signalStation) {
      const result = await useEvidence<SimulationObservation>(
        investigation,
        "runHydrologySimulation",
        { catchmentId, sourceStationId: signalStation },
        `Signal at '${signalStation}': forecasting downstream arrival (illustrative velocity, straight-line distances).`,
        traces,
      );
      if (!result.error) simulation = result;
    }

    const signalClassification: SentinelAssessment["signalClassification"] =
      telemetry.stationsWithData === 0 && flagged.length === 0
        ? "no_data"
        : evidenceBasis === "human_confirmed"
        ? "human_confirmed_contamination"
        : evidenceBasis === "inferred_statistical"
        ? "turbidity_anomaly_unconfirmed"
        : "within_control_limits";

    const first = simulation?.downstreamProjections[0];
    const assessment: SentinelAssessment = {
      stationId: originStationId ?? null,
      catchmentId,
      severity,
      anomalyScore,
      turbidityNtu,
      signalClassification,
      evidenceBasis,
      flaggedStations: flagged.map((f) => ({ stationId: f.stationId, confirmedVia: f.confirmedVia })),
      assumedMeanVelocityKmh: simulation?.assumedMeanVelocityKmh ?? null,
      downstreamArrivalEtaHours: first?.expectedArrivalHours ?? null,
      downstreamArrivalBandHours: first ? { low: first.earliestArrivalHours, high: first.latestArrivalHours } : null,
      affectedDownstreamStations: simulation?.downstreamProjections.map((p) => p.stationId) ?? [],
      rationale:
        `${telemetry.activeAnomaliesCount} station(s) out of statistical control; ${flagged.length} flagged ` +
        `(${humanConfirmed.length} human-confirmed). ` +
        (evidenceBasis === "inferred_statistical"
          ? "The signal is an unconfirmed turbidity inference -- it has not observed a pathogen and needs confirmatory sampling."
          : evidenceBasis === "human_confirmed"
          ? "At least one flag was confirmed by an operator or a reviewed citizen report."
          : "No active signal."),
    };

    return { assessment, traces: renumber(traces), narrative: investigation.narrative };
  }
}
