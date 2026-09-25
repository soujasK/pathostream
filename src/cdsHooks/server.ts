import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { pathToFileURL } from "node:url";
import {
  advanceAllStations,
  clearTelemetryEvent,
  getAllEarlyWarningStates,
  injectTelemetryEvent,
  resetTelemetryFor,
} from "../analytics/earlyWarningEngine.js";
import { CATCHMENTS, COUNTRIES_COVERED, routePrefix, stationAnywhere } from "../data/catchments.js";
import type { CatchmentDefinition, NetworkStation } from "../data/networkTypes.js";
import { collectionBundle } from "../fhir/bundle.js";
import { buildForecastRiskAssessment } from "../fhir/riskAssessment.js";
import { mulberry32 } from "../evaluation/prng.js";
import { travelTimeBand } from "../hydrology/uncertainty.js";
import { createCdsAuthMiddleware, loadCdsAuthFromEnv, type CdsAuthConfig } from "./auth.js";
import { engineFor } from "./catchmentEngines.js";
import {
  discoveryManifest,
  ORDER_SELECT_SERVICE_ID,
  PATIENT_VIEW_SERVICE_ID,
} from "./discovery.js";
import type { ExposureEngine } from "./exposureEngine.js";
import { feedbackSummary, recordFeedback } from "./feedback.js";
import { getRealGaugeReading } from "./realGauge.js";
import {
  dismissObservation,
  getObservation,
  listObservations,
  promoteObservation,
  submitObservation,
} from "../citizen/observations.js";
import { loadDeviceRegistryFromEnv, type DeviceRegistry } from "../iot/deviceAuth.js";
import { deviceState, ingestReading, knownDeviceIds, type DeviceReading } from "../iot/ingest.js";
import { handleOrderSelect } from "./orderSelect.js";
import { handlePatientView } from "./patientView.js";
import type { OrderSelectRequest, PatientViewRequest } from "./types.js";
import {
  CitizenIntelAgent,
  ClinicalTriageAgent,
  DECISION_SUPPORT_NOTICE,
  EpidemicCommanderAgent,
  GeminiAgentRunner,
  SentinelAgent,
  validateCatchmentAndStation,
  validatePatientContext,
  type PatientTriageInput,
} from "../agents/index.js";

/** What the dashboard needs to know about a river without fetching its
 * stations -- everything here is straight from the registry. */
function catchmentSummary(c: CatchmentDefinition) {
  return {
    id: c.id,
    label: c.label,
    region: c.region,
    stationCount: c.stations.length,
    countries: [...new Set(c.stations.map((s) => s.country).filter((x) => x !== undefined))],
    riverLengthKm: c.riverLengthKm ?? null,
    basinAreaKm2: c.basinAreaKm2 ?? null,
    meanVelocityMs: c.meanVelocityMs,
    governance: c.governance ?? null,
    hospitalAnchor: c.hospitalAnchor ?? null,
    provenance: c.provenance,
  };
}

interface CatchmentRouteOptions {
  prefix: string;
  catchmentId: string;
  stations: NetworkStation[];
  findStation: (id: string) => NetworkStation | undefined;
  engine: ExposureEngine;
  meanVelocityMs: number;
  /** Extra side effect to run when this river's /reset is called -- the
   * caller uses it to clear that river's stations' telemetry too. */
  onReset?: () => void;
}

/** Registers the same generic route family for any river + its exposure
 * engine -- called once per entry in the catchment registry (Mondego at
 * the original un-prefixed /demo/* paths, kept for backward compatibility
 * with every existing caller; every other river under /demo/<id>/*),
 * rather than hand-duplicating routes per river. */
function registerCatchmentRoutes(app: ReturnType<typeof express>, options: CatchmentRouteOptions) {
  const { prefix, catchmentId, stations, findStation, engine, meanVelocityMs, onReset } = options;

  app.get(`${prefix}/stations`, (_req: Request, res: Response) => {
    res.json(stations);
  });

  app.post(`${prefix}/simulate`, (req: Request, res: Response) => {
    const body = req.body as { stationId?: string; flagged?: boolean; severityIndex?: number; elapsedMinutes?: number };
    if (!body.stationId || !findStation(body.stationId)) {
      res.status(400).json({ error: `Unknown stationId '${body.stationId}'` });
      return;
    }
    const flaggedAt = new Date(Date.now() - (body.elapsedMinutes ?? 0) * 60_000);
    const flagged = body.flagged ?? true;
    // Re-flagging an already-flagged station is how the demo's fast-forward
    // backdates its clock -- that must not rewrite HOW the station was
    // confirmed (an auto-escalation would silently become "operator" and
    // start claiming a direct biohazard signature). Only a fresh report on
    // an unflagged station is an operator report.
    const existing = engine.getStationState(body.stationId);
    const confirmedVia = flagged && existing.flagged ? existing.confirmedVia : "operator";
    const state = engine.setStationState(body.stationId, flagged, body.severityIndex ?? 0.8, flaggedAt, confirmedVia);
    res.json({ stationId: body.stationId, ...state });
  });

  app.post(`${prefix}/reset`, (_req: Request, res: Response) => {
    engine.resetAllStations();
    onReset?.();
    res.json({ status: "reset" });
  });

  app.get(`${prefix}/state`, (_req: Request, res: Response) => {
    const states = Array.from(engine.getAllStationStates().entries()).map(([stationId, state]) => ({
      stationId,
      ...state,
    }));
    const evaluations = stations.map((s) => engine.evaluateStationExposure(s.id)).filter((e) => e !== null);
    res.json({ catchmentId, stations: states, evaluations });
  });

  app.get(`${prefix}/forecasts`, (_req: Request, res: Response) => {
    const forecasts = engine.getActiveForecasts().map((f) => ({
      sourceStationId: f.sourceStationId,
      targetStationId: f.targetStationId,
      transport: f.transport,
      // Sensitivity of the peak ETA to the placeholder velocity (see uncertainty.ts).
      peakBand: travelTimeBand(f.transport.peakTimeMinutes),
    }));
    res.json({ catchmentId, forecasts });
  });

  app.get(`${prefix}/forecast-bundle`, (_req: Request, res: Response) => {
    const now = new Date();
    const entries = engine.getActiveForecasts().flatMap((f) => {
      const evaluation = engine.evaluateStationExposure(f.targetStationId);
      if (!evaluation || evaluation.isOwnFlag || evaluation.sourceStationId !== f.sourceStationId) return [];

      const resource = buildForecastRiskAssessment({
        source: findStation(f.sourceStationId)!,
        target: findStation(f.targetStationId)!,
        forecast: f.transport,
        wfd: evaluation.wfd,
        meanVelocityMs,
        probability: evaluation.probability,
        now,
      });
      return [resource];
    });
    res.json(collectionBundle(entries));
  });
}

export interface ServerOptions {
  /** CDS Hooks JWT authentication (see auth.ts). Omit to read it from the
   * environment (OAH_CDS_TRUSTED_JWKS); pass `undefined` explicitly for the
   * open demo mode regardless of the environment. */
  cdsAuth?: CdsAuthConfig | undefined;
  /** Mount the /demo/* control routes (mark a station contaminated, inject an
   * anomaly, fast-forward...). They mutate state with no authentication --
   * fine for a demo, a spoofing hazard anywhere else (SAFETY_CASE.md H3).
   * Default: on, unless OAH_DEMO_ROUTES=off. */
  demoRoutes?: boolean | undefined;
  /** Seed for the synthetic telemetry noise, for reproducible runs. Default:
   * OAH_SEED if set, else unseeded (Math.random). */
  seed?: number | undefined;
  /** Device registry for the IoT telemetry-ingestion endpoint (see
   * iot/deviceAuth.ts, IOT_ARCHITECTURE.md). Omit to read it from
   * OAH_IOT_DEVICE_KEYS; pass one explicitly (e.g. in a test) to bypass
   * the environment. */
  iotDevices?: DeviceRegistry | undefined;
  /** Runner for the /api/agents/* narrative model. Omit to build one from the
   * environment (GEMINI_API_KEY); pass `new GeminiAgentRunner({ client: null })`
   * (e.g. in a test) to guarantee no external model is called. */
  agentRunner?: GeminiAgentRunner | undefined;
}

export function createServer(options: ServerOptions = {}) {
  const cdsAuth = "cdsAuth" in options ? options.cdsAuth : loadCdsAuthFromEnv(process.env);
  const demoRoutes = options.demoRoutes ?? process.env.OAH_DEMO_ROUTES !== "off";
  const envSeed = process.env.OAH_SEED === undefined ? undefined : Number(process.env.OAH_SEED);
  const seed = "seed" in options ? options.seed : envSeed !== undefined && Number.isFinite(envSeed) ? envSeed : undefined;
  const telemetryRng = seed === undefined ? Math.random : mulberry32(seed);
  const iotDevices = options.iotDevices ?? loadDeviceRegistryFromEnv(process.env);

  const app = express();
  app.use(express.json());
  app.use(cors());

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  // Discovery is unauthenticated by design (the spec: a client must be able
  // to find the services); every POST under /cds-services is guarded when
  // auth is configured.
  app.get("/cds-services", (_req: Request, res: Response) => {
    res.json(discoveryManifest());
  });

  if (cdsAuth) {
    const guard = createCdsAuthMiddleware(cdsAuth);
    app.use("/cds-services", (req: Request, res: Response, next: NextFunction) =>
      req.method === "POST" ? guard(req, res, next) : next(),
    );
  }

  // A service's endpoint is /cds-services/{service.id} (CDS Hooks spec); the
  // hook-name paths are kept as aliases for existing callers.
  app.post(["/cds-services/patient-view", `/cds-services/${PATIENT_VIEW_SERVICE_ID}`], (req: Request, res: Response) => {
    const request = req.body as PatientViewRequest;
    res.json(handlePatientView(request));
  });

  app.post(["/cds-services/order-select", `/cds-services/${ORDER_SELECT_SERVICE_ID}`], (req: Request, res: Response) => {
    const request = req.body as OrderSelectRequest;
    res.json(handleOrderSelect(request));
  });

  // Feedback (accepted / overridden), CDS Hooks spec: {baseUrl}/cds-services/{service.id}/feedback.
  const serviceIds = new Set<string>([
    ...discoveryManifest().services.map((s) => s.id),
    "patient-view",
    "order-select",
  ]);
  app.post("/cds-services/:serviceId/feedback", (req: Request, res: Response) => {
    const serviceId = String(req.params.serviceId);
    if (!serviceIds.has(serviceId)) {
      res.status(404).json({ error: `Unknown service '${serviceId}'` });
      return;
    }
    const result = recordFeedback(serviceId, req.body);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(200).json({ recorded: result.recorded });
  });

  // Aggregate counts only (no identifiers): the override rate is the
  // alert-fatigue / false-alarm signal a deployment must watch. Outside the
  // /demo prefix on purpose -- this is a monitoring surface, not a demo
  // control; protect it at the network layer in any real deployment.
  app.get("/monitoring/feedback", (_req: Request, res: Response) => {
    res.json(feedbackSummary());
  });

  // A live, real reading from an external government API (PEGELONLINE) --
  // deliberately its own top-level path, well away from /demo, so it can
  // never be mistaken for demo-fabricated state. Water LEVEL only; it does
  // NOT feed the (still-synthetic) turbidity detector -- see
  // data/realGauges.ts. Failure here (network, no match) is a normal
  // 200-with-`available:false` response, never a 500 or a crash: this is
  // supplementary context, and the rest of the app must work with or
  // without it.
  app.get("/real-gauge/:stationId", async (req: Request, res: Response) => {
    const result = await getRealGaugeReading(String(req.params.stationId));
    if (result.ok) {
      res.json({ available: true, ...result.reading });
    } else {
      res.json({ available: false, reason: result.reason, detail: "detail" in result ? result.detail : undefined });
    }
  });

  // --- Citizen observations: a real person's structured water/habitat
  // report (modelled on the real OneAquaHealth Citizen Science App's own
  // observation categories -- see citizen/features.ts), triaged by a real,
  // trained, explainable ML classifier (citizen/classifier.ts -- a
  // genuinely different technique from the EWMA detector, and assessed
  // separately under the EU AI Act in SAFETY_CASE.md section 2.2). Open by
  // design (a citizen has no API key); the classifier NEVER auto-confirms
  // anything on its own -- only the explicit /promote action, standing in
  // for a water-authority reviewer's decision, creates a real flag. ---

  app.post("/citizen/observations", (req: Request, res: Response) => {
    const body = req.body as { stationId?: unknown; input?: unknown; note?: unknown };
    const result = submitObservation(String(body.stationId ?? ""), body.input, body.note);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(201).json(result.observation);
  });

  app.get("/citizen/observations", (req: Request, res: Response) => {
    const stationId = typeof req.query.stationId === "string" ? req.query.stationId : undefined;
    res.json({ observations: listObservations(stationId) });
  });

  app.get("/citizen/observations/:id", (req: Request, res: Response) => {
    const observation = getObservation(String(req.params.id));
    if (!observation) {
      res.status(404).json({ error: "unknown observation id" });
      return;
    }
    res.json(observation);
  });

  app.post("/citizen/observations/:id/promote", (req: Request, res: Response) => {
    const body = req.body as { severityIndex?: unknown };
    const severityIndex = typeof body.severityIndex === "number" ? body.severityIndex : undefined;
    const result = promoteObservation(String(req.params.id), severityIndex);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result.observation);
  });

  app.post("/citizen/observations/:id/dismiss", (_req: Request, res: Response) => {
    const result = dismissObservation(String(_req.params.id));
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result.observation);
  });

  // --- IoT telemetry ingestion: the real, tested endpoint a physical
  // turbidity sensor would call after its reading crosses a LoRaWAN/NB-IoT
  // gateway (see IOT_ARCHITECTURE.md). Isolated from the demo's synthetic
  // per-station telemetry -- an arbitrary device id, never one of the 33
  // registered station ids, and nothing here reaches any exposure engine
  // or CDS Hooks card. Unlike the demo routes, this is designed to be
  // reachable from outside the process, so with no device keys configured
  // it refuses every write (503), never silently accepts one. ---

  app.get("/iot/devices", (_req: Request, res: Response) => {
    res.json({ configured: iotDevices.isConfigured, configuredDeviceIds: iotDevices.deviceIds(), activeDeviceIds: knownDeviceIds() });
  });

  app.get("/iot/devices/:deviceId/state", (req: Request, res: Response) => {
    const summary = deviceState(String(req.params.deviceId));
    if (!summary) {
      res.status(404).json({ error: "no readings received yet for this device id" });
      return;
    }
    res.json(summary);
  });

  app.post("/iot/devices/:deviceId/telemetry", (req: Request, res: Response) => {
    if (!iotDevices.isConfigured) {
      res.status(503).json({ error: "IoT ingestion is not configured (set OAH_IOT_DEVICE_KEYS)" });
      return;
    }
    const deviceId = String(req.params.deviceId);
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith("Bearer ") || !iotDevices.verify(deviceId, authorization.slice("Bearer ".length))) {
      res.setHeader("WWW-Authenticate", 'Bearer error="invalid_token"');
      res.status(401).json({ error: "invalid or missing device key" });
      return;
    }
    const body = req.body as Partial<DeviceReading>;
    if (typeof body.measuredAt !== "string" || typeof body.ntu !== "number") {
      res.status(400).json({ error: "body must include measuredAt (ISO 8601 string) and ntu (number)" });
      return;
    }
    const reading: DeviceReading = { measuredAt: body.measuredAt, ntu: body.ntu };
    if (typeof body.batteryVolts === "number") reading.batteryVolts = body.batteryVolts;
    if (typeof body.rssiDbm === "number") reading.rssiDbm = body.rssiDbm;
    const result = ingestReading(deviceId, reading);
    if (!result.ok) {
      res.status(422).json({ error: result.error });
      return;
    }
    res.status(201).json(result);
  });

  // --- Demo-only scaffolding: real backend state a demo frontend can
  // drive, nothing fabricated in a browser. One route family per river in
  // the registry (data/catchments.ts): Mondego keeps the original
  // un-prefixed /demo/* paths for backward compatibility, every other
  // river is under /demo/<id>/*. The dashboard builds its river switcher,
  // Europe map and disclosure panel from /demo/catchments. ---

  if (!demoRoutes) {
    app.use("/demo", (_req: Request, res: Response) => {
      res.status(404).json({ error: "demo routes are disabled (OAH_DEMO_ROUTES=off)" });
    });
  }

  app.get("/demo/catchments", (_req: Request, res: Response) => {
    res.json({
      countriesCovered: COUNTRIES_COVERED,
      catchments: CATCHMENTS.map((c) => catchmentSummary(c)),
    });
  });

  for (const catchment of CATCHMENTS) {
    registerCatchmentRoutes(app, {
      prefix: routePrefix(catchment),
      catchmentId: catchment.catchmentId,
      stations: catchment.stations,
      findStation: (id) => catchment.stations.find((s) => s.id === id),
      engine: engineFor(catchment.id),
      meanVelocityMs: catchment.meanVelocityMs,
      // A river's Reset also clears ITS stations' telemetry, so an
      // auto-escalation latch can't outlive the flag it created.
      onReset: () => resetTelemetryFor(catchment.stations.map((s) => s.id)),
    });
  }

  // --- Statistical early-warning layer: a real EWMA control chart
  // (src/analytics/ewma.ts) monitoring a synthetic noisy per-station
  // telemetry signal (src/analytics/telemetryStream.ts), one shared
  // registry covering every station of every river. A station that stays
  // out of control long enough is auto-escalated into its own river's
  // exposure engine (see earlyWarningEngine.ts and README's "One causal
  // chain"). ---

  const findAnyStation = (id: string): NetworkStation | undefined => stationAnywhere(id);

  app.get("/demo/telemetry", (_req: Request, res: Response) => {
    res.json({ stations: getAllEarlyWarningStates() });
  });

  app.post("/demo/telemetry/tick", (_req: Request, res: Response) => {
    const stations = advanceAllStations(telemetryRng);
    res.json({ stations });
  });

  app.post("/demo/telemetry/inject", (req: Request, res: Response) => {
    const body = req.body as { stationId?: string };
    if (!body.stationId || !findAnyStation(body.stationId)) {
      res.status(400).json({ error: `Unknown stationId '${body.stationId}'` });
      return;
    }
    injectTelemetryEvent(body.stationId);
    res.json({ status: "event-injected", stationId: body.stationId });
  });

  app.post("/demo/telemetry/clear", (req: Request, res: Response) => {
    const body = req.body as { stationId?: string };
    if (!body.stationId || !findAnyStation(body.stationId)) {
      res.status(400).json({ error: `Unknown stationId '${body.stationId}'` });
      return;
    }
    clearTelemetryEvent(body.stationId);
    res.json({ status: "cleared", stationId: body.stationId });
  });

  // --- Multi-agent layer (SAFETY_CASE.md H14) ---
  // A language model, when configured, may call read-only tools through the
  // guard in agents/toolGuard.ts and writes a labelled narrative; every value
  // and proposal is computed by the agents themselves. Every output is a
  // proposal for human review. Errors are reported generically: an exception message
  // can carry request content, and patient data must not be echoed or logged
  // (H8).
  const agentRunner = options.agentRunner ?? new GeminiAgentRunner();
  const sentinelAgent = new SentinelAgent(agentRunner);
  const citizenIntelAgent = new CitizenIntelAgent(agentRunner);
  const clinicalTriageAgent = new ClinicalTriageAgent(agentRunner);
  const commanderAgent = new EpidemicCommanderAgent(agentRunner);

  app.get("/api/agents/status", (_req: Request, res: Response) => {
    const engine = agentRunner.describeEngine();
    res.json({
      status: "active",
      hasLiveGemini: agentRunner.hasLiveGemini(),
      activeModel: engine.engineId,
      engine,
      patientDataSentToLanguageModel: agentRunner.hasLiveGemini() && agentRunner.patientDataToLlmAllowed(),
      toolGuard: agentRunner.guardLimits(),
      requiresHumanReview: true,
      decisionSupportNotice: DECISION_SUPPORT_NOTICE,
      agents: [
        { role: "sentinel", description: "River telemetry, flags and downstream-arrival forecast" },
        { role: "citizen_intel", description: "Citizen reports by review status; only reviewed reports corroborate" },
        { role: "clinical_triage", description: "Patient proximity to monitored stations and a heuristic pathogen differential for clinician review" },
        { role: "incident_commander", description: "Combines the above into a draft proposal for the competent authority (never issued)" },
      ],
      monitoredRivers: CATCHMENTS.map((c) => ({ id: c.id, label: c.label, stations: c.stations.length })),
    });
  });

  app.post("/api/agents/deliberate", async (req: Request, res: Response) => {
    const target = validateCatchmentAndStation(req.body);
    if (!target.ok) {
      res.status(400).json({ error: target.error });
      return;
    }
    let patientContext: PatientTriageInput | undefined;
    const rawPatient = (req.body as { patientContext?: unknown }).patientContext;
    if (rawPatient !== undefined) {
      const patient = validatePatientContext(rawPatient);
      if (!patient.ok) {
        res.status(400).json({ error: patient.error });
        return;
      }
      patientContext = patient.value;
    }
    try {
      res.json(await commanderAgent.deliberate({ ...target.value, patientContext }));
    } catch {
      res.status(500).json({ error: "Deliberation failed" });
    }
  });

  app.post("/api/agents/triage", async (req: Request, res: Response) => {
    const patient = validatePatientContext(req.body);
    if (!patient.ok) {
      res.status(400).json({ error: patient.error });
      return;
    }
    try {
      res.json(await clinicalTriageAgent.triagePatient(patient.value));
    } catch {
      res.status(500).json({ error: "Triage failed" });
    }
  });

  app.post("/api/agents/sentinel", async (req: Request, res: Response) => {
    const target = validateCatchmentAndStation(req.body);
    if (!target.ok) {
      res.status(400).json({ error: target.error });
      return;
    }
    try {
      res.json(await sentinelAgent.evaluateCatchment(target.value.catchmentId, target.value.stationId));
    } catch {
      res.status(500).json({ error: "Sentinel audit failed" });
    }
  });

  app.post("/api/agents/citizen-intel", async (req: Request, res: Response) => {
    const target = validateCatchmentAndStation(req.body);
    if (!target.ok) {
      res.status(400).json({ error: target.error });
      return;
    }
    try {
      res.json(await citizenIntelAgent.evaluateGroundTruth(target.value.catchmentId));
    } catch {
      res.status(500).json({ error: "Citizen intel evaluation failed" });
    }
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    res.status(400).json({ error: err.message });
  });

  return app;
}

// Cross-platform "was this file run directly" check -- a plain
// `file://${argv[1]}` string template breaks on Windows because Node's
// real file:// URLs have three slashes before a drive letter
// (file:///C:/...), not two; pathToFileURL handles that correctly.
const isMainModule = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  const port = Number(process.env.PORT ?? 4300);
  createServer().listen(port, () => {
    console.log(`OAH-Mondego CDS Hooks service listening on http://127.0.0.1:${port}`);
  });
}
