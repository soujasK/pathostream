/**
 * PathoStream-EHR Agent Tools
 *
 * Deterministic tools the agents call with validated arguments. They bind to
 * the EWMA detectors, the exposure engines, the transport model and the
 * citizen-observation store. None of them invents a reading: where there is
 * no data the result says so (null / hasData: false) instead of substituting
 * a plausible-looking default (SAFETY_CASE.md H14).
 */

import { getAllEarlyWarningStates } from "../analytics/earlyWarningEngine.js";
import { engineFor } from "../cdsHooks/catchmentEngines.js";
import { NEAR_STATION_RADIUS_KM } from "../cdsHooks/patientView.js";
import { listObservations } from "../citizen/observations.js";
import { ALL_STATIONS, catchmentById, catchmentOfStation } from "../data/catchments.js";
import { computeTransportForecast } from "../hydrology/advectionDispersion.js";
import { haversineKm, nearestStation, type StationPosition } from "../hydrology/propagation.js";
import { travelTimeBand } from "../hydrology/uncertainty.js";
import type { AgentRole, AgentThoughtTrace, AgentTool, EvidenceBasis, LikelyPathogen } from "./types.js";

/** LOINC codes verified against loinc.org (README.md "Verified codes").
 * Any other code is withheld rather than emitted unverified. */
export const VERIFIED_LOINC_CODES: ReadonlySet<string> = new Set(["82195-9"]);
export const GI_PANEL_LOINC = "82195-9";

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Who confirmed a flag, as an evidence basis. */
export function evidenceBasisOf(confirmedVia: string | undefined): EvidenceBasis {
  if (confirmedVia === "operator" || confirmedVia === "citizen-reported") return "human_confirmed";
  if (confirmedVia === "statistical-detection") return "inferred_statistical";
  return "none";
}

// Tool 1: Query River Telemetry
export const queryRiverTelemetryTool: AgentTool = {
  declaration: {
    name: "queryRiverTelemetry",
    description: "Latest turbidity (NTU), EWMA statistic and out-of-control status for one catchment or one of its stations, plus the stations currently flagged and who flagged them.",
    parameters: {
      type: "OBJECT",
      properties: {
        catchmentId: { type: "string", description: "Catchment ID (e.g. 'mondego', 'douro', 'danube')." },
        stationId: { type: "string", description: "Optional station ID within that catchment." },
      },
      required: ["catchmentId"],
    },
  },
  execute: async (args: Record<string, unknown>) => {
    const catchment = catchmentById(String(args.catchmentId));
    if (!catchment) return { error: `Unknown catchment '${String(args.catchmentId)}'.` };
    const stationId = args.stationId as string | undefined;
    if (stationId !== undefined && !catchment.stations.some((s) => s.id === stationId)) {
      return { error: `Station '${stationId}' is not in catchment '${catchment.id}'.` };
    }

    const states = getAllEarlyWarningStates();
    const targetStations = stationId ? catchment.stations.filter((s) => s.id === stationId) : catchment.stations;

    const telemetryReport = targetStations.map((station) => {
      const latest = states.find((s) => s.stationId === station.id);
      const reading = latest?.latest ?? null;
      return {
        stationId: station.id,
        stationName: station.name,
        country: station.country,
        hasData: reading !== null,
        turbidityNtu: reading ? round1(reading.sample) : null,
        ewmaStatistic: reading ? round1(reading.z) : null,
        uclNtu: reading ? round1(reading.upperControlLimit) : null,
        isOutOfControl: reading?.outOfControl ?? false,
        autoEscalated: latest?.autoEscalated ?? false,
      };
    });

    const engine = engineFor(catchment.id);
    const flaggedStations = [...engine.getAllStationStates().entries()]
      .filter(([, state]) => state.flagged)
      .map(([id, state]) => ({ stationId: id, confirmedVia: state.confirmedVia, severityIndex: state.severityIndex }));

    const anomalousStations = telemetryReport.filter((t) => t.isOutOfControl || t.autoEscalated);
    return {
      catchmentId: catchment.id,
      totalMonitoredStations: telemetryReport.length,
      stationsWithData: telemetryReport.filter((t) => t.hasData).length,
      activeAnomaliesCount: anomalousStations.length,
      anomalousStations,
      flaggedStations,
      stations: telemetryReport,
    };
  },
};

// Tool 2: Run Hydrology Simulation
export const runHydrologySimulationTool: AgentTool = {
  declaration: {
    name: "runHydrologySimulation",
    description: "1D advection-dispersion forecast of plume peak arrival at each station downstream of a source station, with a 90% travel-time band. Distances are straight-line between stations and the velocity is an illustrative, uncalibrated default.",
    parameters: {
      type: "OBJECT",
      properties: {
        catchmentId: { type: "string", description: "Catchment identifier." },
        sourceStationId: { type: "string", description: "The station where the signal is." },
      },
      required: ["catchmentId", "sourceStationId"],
    },
  },
  execute: async (args: Record<string, unknown>) => {
    const catchment = catchmentById(String(args.catchmentId));
    if (!catchment) return { error: `Unknown catchment '${String(args.catchmentId)}'.` };
    const sourceStationId = String(args.sourceStationId);
    const sourceIdx = catchment.flowOrder.indexOf(sourceStationId);
    // No silent substitution of another station: a forecast from the wrong
    // source would put the wrong reaches at risk.
    if (sourceIdx === -1) return { error: `Station '${sourceStationId}' is not in catchment '${catchment.id}'.` };

    const position = (id: string): StationPosition | undefined => {
      const s = catchment.stations.find((st) => st.id === id);
      return s ? { stationId: s.id, latitude: s.latitude, longitude: s.longitude } : undefined;
    };

    let previous = position(sourceStationId)!;
    let cumulativeKm = 0;
    const downstreamProjections: Array<{
      stationId: string;
      stationName: string;
      distanceFromSourceKm: number;
      expectedArrivalHours: number;
      earliestArrivalHours: number;
      latestArrivalHours: number;
    }> = [];
    for (const targetId of catchment.flowOrder.slice(sourceIdx + 1)) {
      const current = position(targetId);
      if (!current) break;
      cumulativeKm += haversineKm(previous, current);
      previous = current;
      const transport = computeTransportForecast({ distanceKm: cumulativeKm, meanVelocityMs: catchment.meanVelocityMs });
      const band = travelTimeBand(transport.peakTimeMinutes);
      downstreamProjections.push({
        stationId: targetId,
        stationName: catchment.stations.find((s) => s.id === targetId)?.name ?? targetId,
        distanceFromSourceKm: round1(cumulativeKm),
        expectedArrivalHours: round1(transport.peakTimeMinutes / 60),
        earliestArrivalHours: round1(band.lowMinutes / 60),
        latestArrivalHours: round1(band.highMinutes / 60),
      });
    }

    return {
      catchmentId: catchment.id,
      sourceStationId,
      assumedMeanVelocityKmh: round1(catchment.meanVelocityMs * 3.6),
      distanceBasis: "straight-line between consecutive stations (understates river length)",
      downstreamCount: downstreamProjections.length,
      downstreamProjections,
    };
  },
};

// Tool 3: Evaluate Citizen Cluster
export const evaluateCitizenClusterTool: AgentTool = {
  declaration: {
    name: "evaluateCitizenCluster",
    description: "Count citizen reports in a catchment by review status and phenomenon (dead fish, odour, foam, turbidity). Only water-authority-reviewed (promoted) reports count as corroboration.",
    parameters: {
      type: "OBJECT",
      properties: {
        catchmentId: { type: "string", description: "Target river catchment ID." },
      },
      required: ["catchmentId"],
    },
  },
  execute: async (args: Record<string, unknown>) => {
    const catchment = catchmentById(String(args.catchmentId));
    if (!catchment) return { error: `Unknown catchment '${String(args.catchmentId)}'.` };
    const allObs = listObservations().filter((o) => o.catchmentId === catchment.id);
    const reviewed = allObs.filter((o) => o.status === "promoted");

    const summarise = (list: typeof allObs) => ({
      turbidOrMuddy: list.filter((o) => o.input.clarityScore <= 2).length,
      deadFish: list.filter((o) => o.input.deadWildlife).length,
      chemicalOrSewageOdor: list.filter((o) => o.input.unusualOdor).length,
      surfaceFoaming: list.filter((o) => o.input.foam).length,
    });

    // Free-text notes are deliberately not returned: they are unverified
    // public input and would otherwise flow into a language-model prompt.
    return {
      catchmentId: catchment.id,
      totalReports: allObs.length,
      reviewedCount: reviewed.length,
      pendingCount: allObs.filter((o) => o.status === "pending").length,
      dismissedCount: allObs.filter((o) => o.status === "dismissed").length,
      phenomenaSummary: summarise(allObs),
      reviewedPhenomenaSummary: summarise(reviewed),
    };
  },
};

// Tool 4: Patient proximity and exposure status
export const queryPatientFHIRContextTool: AgentTool = {
  declaration: {
    name: "queryPatientFHIRContext",
    description: "Nearest monitored station to a patient's recorded location, whether it is within the monitored radius, and that station's exposure phase and who confirmed the underlying flag.",
    parameters: {
      type: "OBJECT",
      properties: {
        latitude: { type: "number", description: "Patient residential latitude." },
        longitude: { type: "number", description: "Patient residential longitude." },
      },
      required: ["latitude", "longitude"],
    },
  },
  execute: async (args: Record<string, unknown>) => {
    const lat = args.latitude as number;
    const lon = args.longitude as number;

    const positions = new Map<string, StationPosition>();
    for (const station of ALL_STATIONS) {
      positions.set(station.id, { stationId: station.id, latitude: station.latitude, longitude: station.longitude });
    }
    const nearestStationId = nearestStation(positions, lat, lon);
    if (!nearestStationId) return { nearestStation: null, exposureStatus: "none", evidenceBasis: "none" };

    const distanceKm = haversineKm({ stationId: "__patient__", latitude: lat, longitude: lon }, positions.get(nearestStationId)!);
    const catchment = catchmentOfStation(nearestStationId)!;
    const station = catchment.stations.find((s) => s.id === nearestStationId)!;
    const withinMonitoredRadius = distanceKm <= NEAR_STATION_RADIUS_KM;

    const nearest = {
      id: nearestStationId,
      name: station.name,
      catchmentId: catchment.id,
      distanceKm: Math.round(distanceKm * 100) / 100,
      withinMonitoredRadius,
    };
    // Same rule as the patient-view card: a patient outside the radius is
    // not "in a monitored network", whatever the nearest station shows.
    if (!withinMonitoredRadius) return { nearestStation: nearest, exposureStatus: "none", evidenceBasis: "none" };

    const engine = engineFor(catchment.id);
    const exposure = engine.evaluateStationExposure(nearestStationId);
    if (!exposure) return { nearestStation: nearest, exposureStatus: "none", evidenceBasis: "none" };

    const confirmedVia = exposure.isOwnFlag ? exposure.confirmedVia : engine.getStationState(exposure.sourceStationId).confirmedVia;
    return {
      nearestStation: nearest,
      exposureStatus: exposure.phase,
      isOwnFlag: exposure.isOwnFlag,
      sourceStationId: exposure.sourceStationId,
      confirmedVia,
      evidenceBasis: evidenceBasisOf(confirmedVia),
      arrivalProbability: Math.round(exposure.probability * 100) / 100,
    };
  },
};

// Tool 5: Match Pathogen Epidemiology
export const matchPathogenEpidemiologyTool: AgentTool = {
  declaration: {
    name: "matchPathogenEpidemiology",
    description: "Rank candidate waterborne pathogens from symptom keywords and the exposure-to-onset window. Scores are hand-set heuristics, not probabilities.",
    parameters: {
      type: "OBJECT",
      properties: {
        symptomDescription: { type: "string", description: "Presenting symptoms (e.g. watery diarrhea, bloody stools, jaundice, rash, fever)." },
        incubationHours: { type: "number", description: "Hours from suspected water exposure to symptom onset, if known." },
        hasImmuneCompromise: { type: "boolean", description: "Whether the patient is immunocompromised." },
      },
      required: ["symptomDescription"],
    },
  },
  execute: async (args: Record<string, unknown>) => {
    const text = ((args.symptomDescription as string) || "").toLowerCase();
    const hours = typeof args.incubationHours === "number" ? args.incubationHours : undefined;
    const immuneCompromised = (args.hasImmuneCompromise as boolean) ?? false;

    /** Whether the exposure window fits; null when it is unknown. */
    const window = (lo: number, hi: number): boolean | null => (hours === undefined ? null : hours >= lo && hours <= hi);
    /** Higher score only for a positively matched window. */
    const score = (match: boolean | null, matched: number, otherwise: number): number => (match === true ? matched : otherwise);

    const rankings: Array<{
      pathogen: LikelyPathogen;
      heuristicScore: number;
      incubationMatch: boolean | null;
      clinicalRationale: string;
      recommendedTest: string;
      loincCode?: string | undefined;
    }> = [];
    const contraindicationsOrWarnings: string[] = [];

    if (text.includes("watery") || text.includes("diarrhea") || text.includes("cramp")) {
      const match = window(24, 240);
      rankings.push({
        pathogen: "Cryptosporidium parvum",
        heuristicScore: score(match, 0.85, 0.45),
        incubationMatch: match,
        clinicalRationale: "Waterborne protozoan resistant to standard municipal chlorination; causes persistent secretory diarrhea, which can be severe and protracted in immunocompromised patients.",
        recommendedTest: "Gastrointestinal pathogens DNA and RNA panel - Stool PCR",
        loincCode: GI_PANEL_LOINC,
      });
      if (immuneCompromised) {
        contraindicationsOrWarnings.push(
          "IMMUNOCOMPROMISED HOST: cryptosporidiosis can be severe and protracted; consider specialist input.",
        );
      }
    }

    if (text.includes("rash") || text.includes("headache") || text.includes("algal") || text.includes("algae") || (hours !== undefined && hours <= 18)) {
      const isDirectAlgalContact = text.includes("algal") || text.includes("algae") || text.includes("rash");
      const match = window(0, 48);
      rankings.push({
        pathogen: "Microcystin Cyanotoxin (Algal Bloom)",
        heuristicScore: isDirectAlgalContact ? 0.92 : score(match, 0.78, 0.35),
        incubationMatch: match,
        clinicalRationale: "Rapid-onset toxic cyanobacterial peptide causing acute dermatologic and hepatotoxic illness.",
        recommendedTest: "Microcystins / cyanotoxins quantitative immunoassay",
      });
      contraindicationsOrWarnings.push(
        "NON-INFECTIOUS TOXIN: cyanotoxin illness is chemically mediated; antibiotics provide no benefit. Consider a hepatic function panel (ALT/AST, bilirubin).",
      );
    }

    if (text.includes("vomit") || (text.includes("nausea") && !text.includes("algal")) || (hours !== undefined && hours <= 24)) {
      const match = window(12, 50);
      rankings.push({
        pathogen: "Norovirus GI/GII",
        heuristicScore: score(match, 0.76, 0.4),
        incubationMatch: match,
        clinicalRationale: "Highly contagious enteric calicivirus causing acute vomiting, watery diarrhea and rapid community spread.",
        recommendedTest: "Norovirus GI and GII RNA PCR - Stool",
      });
    }

    if (text.includes("blood") || text.includes("bloody") || text.includes("stec") || text.includes("colitis")) {
      const match = window(48, 192);
      rankings.push({
        pathogen: "Escherichia coli O157:H7 (STEC)",
        heuristicScore: score(match, 0.9, 0.5),
        incubationMatch: match,
        clinicalRationale: "Shiga toxin-producing E. coli from agricultural/sewage runoff causing hemorrhagic colitis.",
        recommendedTest: "Shiga toxin 1 and 2 genes (stx1/stx2) PCR - Stool",
      });
      contraindicationsOrWarnings.push(
        "CONTRAINDICATION IF STEC SUSPECTED: empirical antibiotics are associated with increased risk of hemolytic uremic syndrome (HUS).",
      );
      contraindicationsOrWarnings.push(
        "CONTRAINDICATION IF STEC SUSPECTED: antimotility agents (e.g. loperamide) are associated with increased HUS risk.",
      );
    }

    if (text.includes("jaundice") || text.includes("yellow") || text.includes("myalgia") || text.includes("calf") || text.includes("flood")) {
      const match = window(48, 336);
      rankings.push({
        pathogen: "Leptospira interrogans (Leptospirosis)",
        heuristicScore: score(match, 0.89, 0.45),
        incubationMatch: match,
        clinicalRationale: "Zoonotic spirochete transmitted through skin contact with flood or river water; pooled OR 2.19 post-flooding (Naing et al. 2019).",
        recommendedTest: "Leptospira DNA PCR / IgM serology",
      });
      contraindicationsOrWarnings.push(
        "LEPTOSPIROSIS: treatment is typically not delayed for confirmatory serology -- follow local protocol. Consider a renal function panel to screen for Weil's disease.",
      );
    }

    if ((text.includes("profuse") || text.includes("rice-water") || text.includes("lesion") || (immuneCompromised && text.includes("diarrhea"))) && !text.includes("algal")) {
      const match = window(12, 96);
      rankings.push({
        pathogen: "Vibrio cholerae",
        heuristicScore: score(match, 0.72, 0.3),
        incubationMatch: match,
        clinicalRationale: "Halophilic bacterium proliferating in warm seasons; can cause rapid hypovolemic dehydration.",
        recommendedTest: "Vibrio culture / PCR",
      });
    }

    if (text.includes("fever") || text.includes("severe")) {
      const match = window(36, 144);
      rankings.push({
        pathogen: "Campylobacter jejuni",
        heuristicScore: score(match, 0.82, 0.4),
        incubationMatch: match,
        clinicalRationale: "Agricultural runoff contaminant consistent with febrile gastroenteritis and inflammatory colitis.",
        recommendedTest: "Campylobacter antigen / PCR",
      });
    }

    // No keyword matched: return an empty differential rather than a
    // default pathogen -- "nothing matched" is itself the finding.
    rankings.sort((a, b) => b.heuristicScore - a.heuristicScore);

    return {
      assessedIncubationHours: hours ?? null,
      isHighRiskPatient: immuneCompromised,
      differentialRankings: rankings,
      contraindicationsOrWarnings,
      scoreNote: "Scores are hand-set keyword/incubation heuristics for ranking only -- not probabilities, not validated.",
    };
  },
};

// Tool 6: Draft Public Health Advisory
export const draftPublicHealthAdvisoryTool: AgentTool = {
  declaration: {
    name: "draftPublicHealthAdvisory",
    description: "Prepare a DRAFT public-health notice as a FHIR R4 Communication with status 'preparation'. It is never issued or sent; the competent authority must review and approve it.",
    parameters: {
      type: "OBJECT",
      properties: {
        catchmentId: { type: "string", description: "Target river basin / catchment identifier." },
        severity: { type: "string", enum: ["low", "moderate", "critical"], description: "Assessed severity." },
        advisoryType: {
          type: "string",
          enum: ["request_confirmatory_sampling", "recreational_closure", "boil_water_advisory"],
          description: "Proposed action.",
        },
        evidenceBasis: {
          type: "string",
          enum: ["inferred_statistical", "human_confirmed"],
          description: "Whether the signal is an unconfirmed statistical inference or human-confirmed.",
        },
      },
      required: ["catchmentId", "severity", "advisoryType", "evidenceBasis"],
    },
  },
  execute: async (args: Record<string, unknown>) => {
    const catchmentId = String(args.catchmentId);
    const severity = String(args.severity);
    const advisoryType = String(args.advisoryType);
    const evidenceBasis = String(args.evidenceBasis);
    const noticeId = `PH-DRAFT-${Date.now().toString(36).toUpperCase()}`;
    const basisText = evidenceBasis === "human_confirmed"
      ? "a human-confirmed contamination report"
      : "an unconfirmed statistical turbidity signal (no pathogen has been measured)";

    return {
      noticeId,
      catchmentId,
      severity,
      advisoryType,
      evidenceBasis,
      issued: false,
      requiresApprovalBy: "competent public-health / water authority",
      fhirCommunicationPayload: {
        resourceType: "Communication",
        id: noticeId,
        // FHIR R4 EventStatus: 'preparation' = not yet started. A draft is
        // never 'completed' -- nothing has been communicated.
        status: "preparation",
        category: [{
          coding: [{
            system: "http://terminology.hl7.org/CodeSystem/communication-category",
            code: "alert",
            display: "Alert",
          }],
        }],
        payload: [{
          contentString: `[DRAFT - NOT ISSUED - REQUIRES AUTHORITY APPROVAL] Proposed ${advisoryType.replace(/_/g, " ")} for catchment ${catchmentId}, based on ${basisText}. Assessed severity: ${severity}.`,
        }],
      },
      draftedAt: new Date().toISOString(),
    };
  },
};

export const ALL_AGENT_TOOLS = {
  queryRiverTelemetry: queryRiverTelemetryTool,
  runHydrologySimulation: runHydrologySimulationTool,
  evaluateCitizenCluster: evaluateCitizenClusterTool,
  queryPatientFHIRContext: queryPatientFHIRContextTool,
  matchPathogenEpidemiology: matchPathogenEpidemiologyTool,
  draftPublicHealthAdvisory: draftPublicHealthAdvisoryTool,
} satisfies Record<string, AgentTool>;

export type AgentToolName = keyof typeof ALL_AGENT_TOOLS;

/** Run a tool and record it as a deterministic evidence step. */
export async function runTool<T>(
  agentRole: AgentRole,
  name: AgentToolName,
  args: Record<string, unknown>,
  thought: string,
  traces: AgentThoughtTrace[],
): Promise<T> {
  const observation = await ALL_AGENT_TOOLS[name].execute(args);
  traces.push({
    agentRole,
    step: traces.length + 1,
    source: "deterministic_tool",
    thought,
    action: name,
    actionInput: args,
    observation,
    timestamp: new Date().toISOString(),
  });
  return observation as T;
}
