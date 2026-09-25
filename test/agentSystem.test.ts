import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALL_AGENT_TOOLS,
  CitizenIntelAgent,
  ClinicalTriageAgent,
  EpidemicCommanderAgent,
  GeminiAgentRunner,
  LIVE_MODEL_ID,
  RULE_BASED_ENGINE_ID,
  SentinelAgent,
  type ModelFunctionCall,
  type NarrativeModelClient,
} from "../src/agents/index.js";
import { resetAllTelemetry } from "../src/analytics/earlyWarningEngine.js";
import { resetAllStations, setStationState } from "../src/cdsHooks/exposureEngine.js";
import { createServer } from "../src/cdsHooks/server.js";
import { promoteObservation, resetAllObservations, submitObservation } from "../src/citizen/observations.js";
import { MONDEGO_STATIONS } from "../src/data/mondegoNetwork.js";
import { haversineKm } from "../src/hydrology/propagation.js";

// Every test runs with no external model unless it injects a stub: the
// repo's .env may hold a live key, and a test must never send data out.
const ruleBased = () => new GeminiAgentRunner({ client: null });

const UPSTREAM = MONDEGO_STATIONS[0]!;
const NEXT = MONDEGO_STATIONS[1]!;
const MID_ATLANTIC = { latitude: 40.0, longitude: -20.0 };
const concerningInput = { clarityScore: 1, unusualOdor: true, deadWildlife: true, discoloration: false, foam: false };

function stubModel(reply = "Model summary.") {
  const prompts: string[] = [];
  const client: NarrativeModelClient = {
    models: {
      generateContent: async (req) => {
        prompts.push(JSON.stringify(req.contents));
        return { text: reply };
      },
    },
  };
  return { client, prompts };
}

function patientAt(latitude: number, longitude: number, overrides: Record<string, unknown> = {}) {
  return { patientId: "PHI-PT-4417", latitude, longitude, symptoms: "watery diarrhea and cramps", ...overrides };
}

beforeEach(() => {
  resetAllStations();
  resetAllTelemetry();
  resetAllObservations();
});

describe("agent tools report data honestly", () => {
  it("reports a station with no telemetry as null, never a default reading", async () => {
    const res = (await ALL_AGENT_TOOLS.queryRiverTelemetry.execute({ catchmentId: "mondego" })) as {
      stations: Array<{ hasData: boolean; turbidityNtu: number | null; uclNtu: number | null }>;
    };
    expect(res.stations.length).toBe(MONDEGO_STATIONS.length);
    for (const s of res.stations) {
      expect(s.hasData).toBe(false);
      expect(s.turbidityNtu).toBeNull();
      expect(s.uclNtu).toBeNull();
    }
  });

  it("rejects an unknown catchment or a station from another catchment instead of substituting one", async () => {
    expect(await ALL_AGENT_TOOLS.queryRiverTelemetry.execute({ catchmentId: "thames" })).toHaveProperty("error");
    expect(await ALL_AGENT_TOOLS.queryRiverTelemetry.execute({ catchmentId: "douro", stationId: UPSTREAM.id })).toHaveProperty("error");
    expect(await ALL_AGENT_TOOLS.runHydrologySimulation.execute({ catchmentId: "douro", sourceStationId: UPSTREAM.id })).toHaveProperty("error");
  });

  it("forecasts downstream arrival from the real station geometry, not a fixed per-segment distance", async () => {
    const res = (await ALL_AGENT_TOOLS.runHydrologySimulation.execute({ catchmentId: "mondego", sourceStationId: UPSTREAM.id })) as {
      downstreamProjections: Array<{ stationId: string; distanceFromSourceKm: number; earliestArrivalHours: number; expectedArrivalHours: number; latestArrivalHours: number }>;
    };
    const first = res.downstreamProjections[0]!;
    expect(first.stationId).toBe(NEXT.id);
    expect(first.distanceFromSourceKm).toBeCloseTo(haversineKm({ stationId: "a", ...UPSTREAM }, { stationId: "b", ...NEXT }), 1);
    expect(first.earliestArrivalHours).toBeLessThanOrEqual(first.expectedArrivalHours);
    expect(first.latestArrivalHours).toBeGreaterThanOrEqual(first.expectedArrivalHours);
  });

  it("returns an empty differential when no symptom matches, never a default pathogen", async () => {
    const res = (await ALL_AGENT_TOOLS.matchPathogenEpidemiology.execute({ symptomDescription: "mild fatigue" })) as {
      differentialRankings: unknown[];
    };
    expect(res.differentialRankings).toEqual([]);
  });

  it("reports the incubation match as unknown when the exposure time is not given", async () => {
    const res = (await ALL_AGENT_TOOLS.matchPathogenEpidemiology.execute({ symptomDescription: "watery diarrhea" })) as {
      differentialRankings: Array<{ incubationMatch: boolean | null }>;
    };
    expect(res.differentialRankings.length).toBeGreaterThan(0);
    for (const r of res.differentialRankings) expect(r.incubationMatch).toBeNull();
  });

  it("only ever drafts an advisory: FHIR status 'preparation', never issued", async () => {
    const res = (await ALL_AGENT_TOOLS.draftPublicHealthAdvisory.execute({
      catchmentId: "mondego",
      severity: "critical",
      advisoryType: "boil_water_advisory",
      evidenceBasis: "human_confirmed",
    })) as { issued: boolean; fhirCommunicationPayload: { resourceType: string; status: string; payload: Array<{ contentString: string }> } };
    expect(res.issued).toBe(false);
    expect(res.fhirCommunicationPayload.resourceType).toBe("Communication");
    expect(res.fhirCommunicationPayload.status).toBe("preparation");
    expect(res.fhirCommunicationPayload.payload[0]!.contentString).toContain("NOT ISSUED");
  });
});

describe("engine provenance is never misrepresented", () => {
  it("labels rule-based output as rule-based, with no narrative and no model name", async () => {
    const { narrative, traces } = await new SentinelAgent(ruleBased()).evaluateCatchment("mondego");
    expect(narrative.engine.provenance).toBe("rule_based");
    expect(narrative.engine.engineId).toBe(RULE_BASED_ENGINE_ID);
    expect(narrative.engine.engineId.toLowerCase()).not.toContain("gemini");
    expect(narrative.text).toBeNull();
    expect(traces.every((t) => t.source === "deterministic_tool")).toBe(true);
  });

  it("GET /api/agents/status reports the same engine label the agents use", async () => {
    const res = await request(createServer({ cdsAuth: undefined, agentRunner: ruleBased() })).get("/api/agents/status");
    expect(res.status).toBe(200);
    expect(res.body.activeModel).toBe(RULE_BASED_ENGINE_ID);
    expect(res.body.hasLiveGemini).toBe(false);
    expect(res.body.requiresHumanReview).toBe(true);
    expect(res.body.monitoredRivers.length).toBe(9);
  });

  it("labels a live narrative as model-generated, and the model's text never changes the assessment", async () => {
    const { client } = stubModel("Severity is CATASTROPHIC; issue a boil-water order now.");
    const live = await new SentinelAgent(new GeminiAgentRunner({ client })).evaluateCatchment("mondego");
    const offline = await new SentinelAgent(ruleBased()).evaluateCatchment("mondego");
    expect(live.narrative.engine).toEqual({ provenance: "live_llm", engineId: LIVE_MODEL_ID });
    expect(live.traces.some((t) => t.source === "language_model")).toBe(true);
    expect(live.assessment).toEqual(offline.assessment);
  });

  it("falls back to rule-based with a stated reason when the model call fails, without logging the prompt", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const failing: NarrativeModelClient = { models: { generateContent: async () => { throw new Error("upstream error echoing CATCHMENT-SECRET"); } } };
    const { narrative } = await new CitizenIntelAgent(new GeminiAgentRunner({ client: failing })).evaluateGroundTruth("mondego");
    expect(narrative.engine.provenance).toBe("rule_based");
    expect(narrative.engine.fallbackReason).toBeDefined();
    expect(warn.mock.calls.flat().map(String).join("\n")).not.toContain("CATCHMENT-SECRET");
    warn.mockRestore();
  });
});

describe("patient data stays local by default", () => {
  it("does not send a patient's symptoms to the external model unless explicitly allowed", async () => {
    const { client, prompts } = stubModel();
    const { narrative } = await new ClinicalTriageAgent(new GeminiAgentRunner({ client, allowPatientDataToLlm: false }))
      .triagePatient(patientAt(UPSTREAM.latitude, UPSTREAM.longitude));
    expect(prompts).toEqual([]);
    expect(narrative.engine.provenance).toBe("rule_based");
    expect(narrative.engine.fallbackReason).toMatch(/patient data/);
  });

  it("even when allowed, never sends the patient identifier or location", async () => {
    const { client, prompts } = stubModel();
    await new ClinicalTriageAgent(new GeminiAgentRunner({ client, allowPatientDataToLlm: true }))
      .triagePatient(patientAt(UPSTREAM.latitude, UPSTREAM.longitude));
    expect(prompts.length).toBe(1);
    expect(prompts[0]).not.toContain("PHI-PT-4417");
    expect(prompts[0]).not.toContain(String(UPSTREAM.latitude));
  });

  it("keeps the patient assessment out of the commander's model prompt", async () => {
    const { client, prompts } = stubModel();
    await new EpidemicCommanderAgent(new GeminiAgentRunner({ client, allowPatientDataToLlm: false })).deliberate({
      catchmentId: "mondego",
      patientContext: patientAt(UPSTREAM.latitude, UPSTREAM.longitude, { symptoms: "UNIQUE-SYMPTOM-MARKER diarrhea" }),
    });
    expect(prompts.length).toBeGreaterThan(0);
    for (const p of prompts) {
      expect(p).not.toContain("PHI-PT-4417");
      expect(p).not.toContain("UNIQUE-SYMPTOM-MARKER");
    }
  });
});

describe("sentinel and commander respect the evidence basis", () => {
  it("with no signal: no fabricated turbidity or ETA, and no action proposed", async () => {
    const consensus = await new EpidemicCommanderAgent(ruleBased()).deliberate({ catchmentId: "mondego" });
    expect(consensus.sentinel.turbidityNtu).toBeNull();
    expect(consensus.sentinel.downstreamArrivalEtaHours).toBeNull();
    expect(consensus.sentinel.signalClassification).toBe("no_data");
    expect(consensus.evidenceBasis).toBe("none");
    expect(consensus.commanderDirective.proposedAction).toBe("none");
  });

  it("an unconfirmed statistical signal only ever proposes confirmatory sampling", async () => {
    setStationState(UPSTREAM.id, true, 0.95, new Date(), "statistical-detection");
    const consensus = await new EpidemicCommanderAgent(ruleBased()).deliberate({ catchmentId: "mondego" });
    expect(consensus.sentinel.signalClassification).toBe("turbidity_anomaly_unconfirmed");
    expect(consensus.evidenceBasis).toBe("inferred_statistical");
    expect(consensus.commanderDirective.proposedAction).toBe("request_confirmatory_sampling");
    expect(consensus.sentinel.downstreamArrivalEtaHours).not.toBeNull();
  });

  it("a human-confirmed signal yields a proposal that is a draft, never issued", async () => {
    setStationState(UPSTREAM.id, true, 0.95, new Date(), "operator");
    const consensus = await new EpidemicCommanderAgent(ruleBased()).deliberate({ catchmentId: "mondego" });
    expect(consensus.evidenceBasis).toBe("human_confirmed");
    expect(consensus.commanderDirective.proposedAction).not.toBe("none");
    expect(consensus.commanderDirective.status).toBe("draft_pending_authority_approval");
    expect(consensus.commanderDirective.municipalAdvisory).toContain("NOT ISSUED");
    expect(consensus.commanderDirective.ehrBroadcastAlert).toContain("NOT SENT");
    expect(consensus.requiresHumanReview).toBe(true);
  });

  it("unreviewed citizen reports never count as corroboration; reviewed ones do", async () => {
    setStationState(UPSTREAM.id, true, 0.95, new Date(), "statistical-detection");
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = submitObservation(NEXT.id, concerningInput, null);
      if (r.ok) ids.push(r.observation.id);
    }
    const before = await new EpidemicCommanderAgent(ruleBased()).deliberate({ catchmentId: "mondego" });
    expect(before.citizenIntel.unreviewedCount).toBe(5);
    expect(before.citizenIntel.correlatesWithPlume).toBe(false);

    promoteObservation(ids[0]!);
    const after = await new CitizenIntelAgent(ruleBased()).evaluateGroundTruth("mondego", true);
    expect(after.assessment.reviewedCount).toBe(1);
    expect(after.assessment.correlatesWithPlume).toBe(true);
  });

  it("a single patient's assessment never changes the population-level proposal", async () => {
    setStationState(UPSTREAM.id, true, 0.95, new Date(), "statistical-detection");
    const commander = new EpidemicCommanderAgent(ruleBased());
    const without = await commander.deliberate({ catchmentId: "mondego" });
    const withPatient = await commander.deliberate({
      catchmentId: "mondego",
      patientContext: patientAt(UPSTREAM.latitude, UPSTREAM.longitude, { symptoms: "bloody stools, fever, severe cramps", isImmunocompromised: true }),
    });
    expect(withPatient.overallSeverity).toBe(without.overallSeverity);
    expect(withPatient.commanderDirective.proposedAction).toBe(without.commanderDirective.proposedAction);
  });
});

describe("clinical triage reports unknowns as unknown", () => {
  it("a patient far from any monitored station gets no river signal and no invented station distance", async () => {
    const { assessment } = await new ClinicalTriageAgent(ruleBased()).triagePatient(patientAt(MID_ATLANTIC.latitude, MID_ATLANTIC.longitude));
    expect(assessment.nearestStation!.withinMonitoredRadius).toBe(false);
    expect(assessment.exposureStatus).toBe("none");
    expect(assessment.triagePriority).toBe("ROUTINE");
    expect(assessment.waterExposureEvidenceSummary).toContain("outside");
    expect(assessment.requiresClinicianReview).toBe(true);
  });

  it("URGENT only for a human-confirmed signal at the patient's station, not an inferred one or immunocompromise alone", async () => {
    const agent = new ClinicalTriageAgent(ruleBased());
    const at = patientAt(UPSTREAM.latitude, UPSTREAM.longitude, { isImmunocompromised: true });

    expect((await agent.triagePatient(at)).assessment.triagePriority).toBe("ROUTINE");

    setStationState(UPSTREAM.id, true, 0.95, new Date(), "statistical-detection");
    const inferred = (await agent.triagePatient(at)).assessment;
    expect(inferred.exposureEvidenceBasis).toBe("inferred_statistical");
    expect(inferred.triagePriority).toBe("ROUTINE");

    setStationState(UPSTREAM.id, true, 0.95, new Date(), "operator");
    expect((await agent.triagePatient(at)).assessment.triagePriority).toBe("URGENT");
  });

  it("withholds LOINC codes that have not been verified against loinc.org", async () => {
    const { assessment } = await new ClinicalTriageAgent(ruleBased()).triagePatient(
      patientAt(UPSTREAM.latitude, UPSTREAM.longitude, { symptoms: "bloody diarrhea, colitis", exposureHoursAgo: 72 }),
    );
    const stec = assessment.recommendedDiagnostics.find((d) => d.testName.includes("Shiga"));
    expect(stec).toBeDefined();
    expect(stec!.loincCode).toBeUndefined();
    const emitted = assessment.recommendedDiagnostics.map((d) => d.loincCode).filter(Boolean);
    expect(emitted).toEqual(["82195-9"]);
  });

  it("labels pathogen scores as heuristic ranks, never as a confidence", async () => {
    const { assessment } = await new ClinicalTriageAgent(ruleBased()).triagePatient(patientAt(UPSTREAM.latitude, UPSTREAM.longitude));
    expect(assessment.pathogenRankings[0]).toHaveProperty("heuristicScore");
    expect(assessment.waterExposureEvidenceSummary).toContain("not a probability");
    expect(assessment.waterExposureEvidenceSummary).not.toMatch(/confidence/i);
  });
});

describe("agent HTTP endpoints validate input and protect patient data", () => {
  const app = createServer({ cdsAuth: undefined, agentRunner: ruleBased() });
  let spies: Array<ReturnType<typeof vi.spyOn>> = [];
  afterEach(() => {
    for (const s of spies) s.mockRestore();
    spies = [];
  });

  it("400s a missing or unknown catchment, or a station from another catchment, instead of defaulting", async () => {
    for (const body of [{}, { catchmentId: "thames" }, { catchmentId: "douro", stationId: UPSTREAM.id }]) {
      for (const path of ["/api/agents/deliberate", "/api/agents/sentinel", "/api/agents/citizen-intel"]) {
        const res = await request(app).post(path).send(body);
        expect(res.status, `${path} ${JSON.stringify(body)}`).toBe(400);
      }
    }
  });

  it("400s an invalid patient context instead of defaulting symptoms or coordinates", async () => {
    const valid = patientAt(UPSTREAM.latitude, UPSTREAM.longitude);
    const bad = [
      { ...valid, symptoms: undefined },
      { ...valid, symptoms: "   " },
      { ...valid, latitude: 91 },
      { ...valid, longitude: "-8.4" },
      { ...valid, patientId: "" },
      { ...valid, exposureHoursAgo: -1 },
      { ...valid, isImmunocompromised: "yes" },
    ];
    for (const body of bad) {
      expect((await request(app).post("/api/agents/triage").send(body)).status, JSON.stringify(body)).toBe(400);
      expect((await request(app).post("/api/agents/deliberate").send({ catchmentId: "mondego", patientContext: body })).status).toBe(400);
    }
  });

  it("serves a valid triage and deliberation", async () => {
    const triage = await request(app).post("/api/agents/triage").send(patientAt(UPSTREAM.latitude, UPSTREAM.longitude));
    expect(triage.status).toBe(200);
    expect(triage.body.assessment.requiresClinicianReview).toBe(true);
    const deliberation = await request(app).post("/api/agents/deliberate").send({ catchmentId: "douro" });
    expect(deliberation.status).toBe(200);
    expect(deliberation.body.commanderDirective.status).toBe("draft_pending_authority_approval");
  });

  it("nothing identifying a patient reaches the console during agent triage and deliberation", async () => {
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      spies.push(vi.spyOn(console, method).mockImplementation(() => undefined));
    }
    const failing: NarrativeModelClient = { models: { generateContent: async () => { throw new Error("boom"); } } };
    const leakyApp = createServer({ cdsAuth: undefined, agentRunner: new GeminiAgentRunner({ client: failing, allowPatientDataToLlm: true }) });
    const patient = patientAt(UPSTREAM.latitude, UPSTREAM.longitude);
    await request(leakyApp).post("/api/agents/triage").send(patient);
    await request(leakyApp).post("/api/agents/deliberate").send({ catchmentId: "mondego", patientContext: patient });
    await request(leakyApp).post("/api/agents/triage").send({ ...patient, latitude: 999 });

    const logged = spies.flatMap((s) => s.mock.calls.flat()).map(String).join("\n");
    expect(logged).not.toContain(patient.patientId);
    expect(logged).not.toContain(String(UPSTREAM.latitude));
  });
});

/** A model that plays a fixed script: each entry is one turn's function
 * calls; after the script it answers with text. Records every request. */
function scriptedModel(script: ModelFunctionCall[][], finalText = "Summary of tool results.") {
  const requests: Array<{ contents: unknown; config?: Record<string, unknown> }> = [];
  let turn = 0;
  const client: NarrativeModelClient = {
    models: {
      generateContent: async (req) => {
        requests.push({ contents: JSON.parse(JSON.stringify(req.contents)), ...(req.config ? { config: req.config } : {}) });
        const calls = script[turn++];
        return calls ? { functionCalls: calls } : { text: finalText };
      },
    },
  };
  return { client, requests };
}

describe("guarded model tool calling", () => {
  it("rejects a call outside the agent's allowlist, including drafting an advisory, without executing it", async () => {
    setStationState(UPSTREAM.id, true, 0.95, new Date(), "operator");
    const { client } = scriptedModel([[{ name: "draftPublicHealthAdvisory", args: { catchmentId: "mondego", severity: "critical", advisoryType: "boil_water_advisory", evidenceBasis: "human_confirmed" } }]]);
    const { traces } = await new SentinelAgent(new GeminiAgentRunner({ client })).evaluateCatchment("mondego");
    const rejected = traces.filter((t) => t.source === "rejected_tool_call");
    expect(rejected.length).toBe(1);
    expect(rejected[0]!.thought).toContain("not permitted");
    expect(rejected[0]!.observation).toBeUndefined();
    expect(traces.some((t) => t.action === "draftPublicHealthAdvisory" && t.source !== "rejected_tool_call")).toBe(false);
  });

  it("rejects a call that leaves the request's scope or has a malformed argument", async () => {
    const { client } = scriptedModel([[
      { name: "queryRiverTelemetry", args: { catchmentId: "douro" } },
      { name: "queryRiverTelemetry", args: { catchmentId: "mondego", stationId: "PT-PORTO" } },
      { name: "queryRiverTelemetry", args: { catchmentId: "mondego", stationId: 42 } },
      { name: "runHydrologySimulation", args: { catchmentId: "mondego", sourceStationId: UPSTREAM.id, forecastHours: 999 } },
    ]]);
    const { traces } = await new SentinelAgent(new GeminiAgentRunner({ client })).evaluateCatchment("mondego");
    const reasons = traces.filter((t) => t.source === "rejected_tool_call").map((t) => t.thought);
    expect(reasons).toHaveLength(4);
    expect(reasons[0]).toContain("scoped to catchment 'mondego'");
    expect(reasons[1]).toContain("not in catchment");
    expect(reasons[2]).toContain("must be a string");
    expect(reasons[3]).toContain("not accepted");
  });

  it("never shows the model patient parameters, and refuses a model-supplied location", async () => {
    const { client, requests } = scriptedModel([
      [{ name: "queryPatientFHIRContext", args: { latitude: 52.37, longitude: 4.89 } }],
      [{ name: "queryPatientFHIRContext", args: {} }, { name: "matchPathogenEpidemiology", args: {} }],
    ]);
    const patient = patientAt(UPSTREAM.latitude, UPSTREAM.longitude, { symptoms: "UNIQUE-SYMPTOM-MARKER diarrhea" });
    const { assessment, traces, narrative } = await new ClinicalTriageAgent(new GeminiAgentRunner({ client, allowPatientDataToLlm: true })).triagePatient(patient);

    const declarations = JSON.stringify(requests[0]!.config);
    expect(declarations).not.toMatch(/latitude|longitude|symptomDescription|patientId/);
    expect(traces.find((t) => t.source === "rejected_tool_call")!.thought).toContain("'latitude' is not accepted");
    const accepted = traces.find((t) => t.source === "model_requested_tool" && t.action === "queryPatientFHIRContext")!;
    expect(accepted.actionInput).toEqual({ latitude: UPSTREAM.latitude, longitude: UPSTREAM.longitude });
    expect(assessment.nearestStation!.id).toBe(UPSTREAM.id);
    expect(narrative.evidenceGapsFilled).toEqual([]);
    for (const r of requests) {
      const sent = JSON.stringify(r.contents);
      expect(sent).not.toContain("PHI-PT-4417");
      expect(sent).not.toContain(String(UPSTREAM.latitude));
    }
  });

  it("uses a correctly-bound model call as evidence instead of repeating it", async () => {
    const { client } = scriptedModel([[{ name: "evaluateCitizenCluster", args: { catchmentId: "mondego" } }]]);
    const { traces, narrative } = await new CitizenIntelAgent(new GeminiAgentRunner({ client })).evaluateGroundTruth("mondego");
    expect(traces.filter((t) => t.action === "evaluateCitizenCluster").map((t) => t.source)).toEqual(["model_requested_tool"]);
    expect(narrative.evidenceGapsFilled).toEqual([]);
    expect(narrative.text).toBe("Summary of tool results.");
  });

  it("gap-fills evidence the model skipped or fetched with other arguments, and says so", async () => {
    setStationState(UPSTREAM.id, true, 0.95, new Date(), "statistical-detection");
    const { client } = scriptedModel([[
      { name: "queryRiverTelemetry", args: { catchmentId: "mondego" } },
      { name: "runHydrologySimulation", args: { catchmentId: "mondego", sourceStationId: NEXT.id } },
    ]]);
    const { traces, narrative } = await new SentinelAgent(new GeminiAgentRunner({ client })).evaluateCatchment("mondego");
    expect(narrative.evidenceGapsFilled).toEqual(["runHydrologySimulation"]);
    const used = traces.filter((t) => t.action === "runHydrologySimulation" && t.source === "deterministic_tool");
    expect(used).toHaveLength(1);
    expect(used[0]!.actionInput).toEqual({ catchmentId: "mondego", sourceStationId: UPSTREAM.id });
  });

  it("enforces the tool-call and turn budgets", async () => {
    const loop = Array.from({ length: 10 }, () => [{ name: "queryRiverTelemetry", args: { catchmentId: "mondego" } }]);
    const { client, requests } = scriptedModel(loop);
    const { traces, narrative } = await new SentinelAgent(new GeminiAgentRunner({ client, maxToolCalls: 2, maxTurns: 3 })).evaluateCatchment("mondego");
    expect(requests).toHaveLength(3);
    expect(traces.filter((t) => t.source === "model_requested_tool")).toHaveLength(2);
    expect(traces.find((t) => t.source === "rejected_tool_call")!.thought).toContain("budget");
    expect(narrative.text).toBeNull();
    expect(narrative.engine.fallbackReason).toContain("still calling tools");
  });

  it("times out a model that does not answer and falls back to rule-based", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const hanging: NarrativeModelClient = { models: { generateContent: () => new Promise(() => undefined) } };
    const { narrative, assessment } = await new SentinelAgent(new GeminiAgentRunner({ client: hanging, requestTimeoutMs: 20 })).evaluateCatchment("mondego");
    expect(narrative.engine.provenance).toBe("rule_based");
    expect(narrative.engine.fallbackReason).toContain("did not answer");
    expect(assessment.catchmentId).toBe("mondego");
    warn.mockRestore();
  });

  it("retries a transient model overload once, then carries on live", async () => {
    let calls = 0;
    const flaky: NarrativeModelClient = {
      models: {
        generateContent: async () => {
          calls++;
          if (calls === 1) throw Object.assign(new Error("overloaded"), { status: 503 });
          return { text: "Summary after retry." };
        },
      },
    };
    const { narrative } = await new CitizenIntelAgent(new GeminiAgentRunner({ client: flaky })).evaluateGroundTruth("mondego");
    expect(calls).toBe(2);
    expect(narrative.engine.provenance).toBe("live_llm");
    expect(narrative.text).toBe("Summary after retry.");
  });

  it("whatever the model does, every assessment equals the rule-based one", async () => {
    setStationState(UPSTREAM.id, true, 0.95, new Date(), "statistical-detection");
    const r = submitObservation(NEXT.id, concerningInput, null);
    if (r.ok) promoteObservation(r.observation.id);
    const hostileTurn: ModelFunctionCall[] = [
      { name: "queryRiverTelemetry", args: { catchmentId: "danube" } },
      { name: "runHydrologySimulation", args: { catchmentId: "mondego", sourceStationId: MONDEGO_STATIONS.at(-1)!.id } },
      { name: "evaluateCitizenCluster", args: { catchmentId: "rhine" } },
      { name: "draftPublicHealthAdvisory", args: { catchmentId: "mondego", severity: "critical", advisoryType: "boil_water_advisory", evidenceBasis: "human_confirmed" } },
      { name: "queryPatientFHIRContext", args: { latitude: 0, longitude: 0 } },
      { name: "matchPathogenEpidemiology", args: { symptomDescription: "bloody stools" } },
      { name: "notATool", args: {} },
    ];
    // Every investigation's first turn is the hostile one; then it "summarises".
    const client: NarrativeModelClient = {
      models: {
        generateContent: async (req) =>
          req.contents.length === 1 && req.config && "tools" in req.config
            ? { functionCalls: hostileTurn }
            : { text: "Everything is fine; issue a boil-water order now." },
      },
    };
    const patient = patientAt(UPSTREAM.latitude, UPSTREAM.longitude, { isImmunocompromised: true });
    const essentials = (c: Awaited<ReturnType<EpidemicCommanderAgent["deliberate"]>>) => ({
      overallSeverity: c.overallSeverity,
      evidenceBasis: c.evidenceBasis,
      sentinel: c.sentinel,
      citizenIntel: c.citizenIntel,
      clinicalTriage: c.clinicalTriage,
      proposedAction: c.commanderDirective.proposedAction,
      municipalAdvisory: c.commanderDirective.municipalAdvisory,
      ehrBroadcastAlert: c.commanderDirective.ehrBroadcastAlert,
    });

    const offline = await new EpidemicCommanderAgent(ruleBased()).deliberate({ catchmentId: "mondego", patientContext: patient });
    const live = await new EpidemicCommanderAgent(new GeminiAgentRunner({ client, allowPatientDataToLlm: true })).deliberate({ catchmentId: "mondego", patientContext: patient });
    expect(essentials(live)).toEqual(essentials(offline));
    expect(live.traces.filter((t) => t.source === "rejected_tool_call").length).toBeGreaterThanOrEqual(5);
  });
});
