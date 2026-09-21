import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { pathToFileURL } from "node:url";
import {
  advanceAllStations,
  clearTelemetryEvent,
  getAllEarlyWarningStates,
  injectTelemetryEvent,
  resetAllTelemetry,
} from "../analytics/earlyWarningEngine.js";
import { DOURO_CATCHMENT_ID, DOURO_MEAN_VELOCITY_MS, DOURO_STATIONS, douroStationById } from "../data/douroNetwork.js";
import { MONDEGO_CATCHMENT_ID, MONDEGO_STATIONS, type NetworkStation, stationById } from "../data/mondegoNetwork.js";
import { buildForecastRiskAssessment } from "../fhir/riskAssessment.js";
import { discoveryManifest } from "./discovery.js";
import { douroEngine } from "./douroExposureEngine.js";
import { mondegoEngine, type ExposureEngine } from "./exposureEngine.js";
import { handleOrderSelect } from "./orderSelect.js";
import { handlePatientView } from "./patientView.js";
import type { OrderSelectRequest, PatientViewRequest } from "./types.js";

const NETWORK_MEAN_VELOCITY_MS = 0.36;

interface CatchmentRouteOptions {
  prefix: string;
  catchmentId: string;
  stations: NetworkStation[];
  findStation: (id: string) => NetworkStation | undefined;
  engine: ExposureEngine;
  meanVelocityMs: number;
  /** Extra side effect to run when this catchment's /reset is called --
   * used only for Mondego's un-prefixed /demo/reset, which has always
   * also cleared the (network-agnostic) telemetry layer; see that call
   * site for why Douro's own /demo/douro/reset does not do the same. */
  onReset?: () => void;
}

/** Registers the same generic /demo/:catchment/* route family for any
 * network + its exposure engine -- used once for Mondego (kept at the
 * original un-prefixed /demo/* paths for backward compatibility with
 * every existing test/caller) and once for Douro (under /demo/douro/*),
 * rather than hand-duplicating five routes per network. */
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
      return [{ resource }];
    });
    res.json({ resourceType: "Bundle", type: "collection", entry: entries });
  });
}

export function createServer() {
  const app = express();
  app.use(express.json());
  app.use(cors());

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  app.get("/cds-services", (_req: Request, res: Response) => {
    res.json(discoveryManifest());
  });

  app.post("/cds-services/patient-view", (req: Request, res: Response) => {
    const request = req.body as PatientViewRequest;
    res.json(handlePatientView(request));
  });

  app.post("/cds-services/order-select", (req: Request, res: Response) => {
    const request = req.body as OrderSelectRequest;
    res.json(handleOrderSelect(request));
  });

  // --- Demo-only scaffolding: real backend state a demo frontend can
  // drive, nothing fabricated in a browser. Registered once for Mondego
  // (kept at the original un-prefixed /demo/* paths for backward
  // compatibility with every existing test/caller) and once for the
  // cross-border Douro network, from the exact same generic route
  // registrar and exposure-engine factory -- see registerCatchmentRoutes
  // above and exposureEngine.ts's docstring. ---

  registerCatchmentRoutes(app, {
    prefix: "/demo",
    catchmentId: MONDEGO_CATCHMENT_ID,
    stations: MONDEGO_STATIONS,
    findStation: stationById,
    engine: mondegoEngine,
    meanVelocityMs: NETWORK_MEAN_VELOCITY_MS,
    onReset: resetAllTelemetry,
  });

  registerCatchmentRoutes(app, {
    prefix: "/demo/douro",
    catchmentId: DOURO_CATCHMENT_ID,
    stations: DOURO_STATIONS,
    findStation: douroStationById,
    engine: douroEngine,
    meanVelocityMs: DOURO_MEAN_VELOCITY_MS,
  });

  // --- Statistical early-warning layer: a real EWMA control chart
  // (src/analytics/ewma.ts) monitoring a synthetic noisy per-station
  // telemetry signal (src/analytics/telemetryStream.ts). Deliberately
  // independent of the exposure engine(s) above, and network-agnostic --
  // one shared registry covers every station across both catchments (see
  // earlyWarningEngine.ts's docstring and README's "Two independent
  // signals" note). ---

  const findAnyStation = (id: string): NetworkStation | undefined => stationById(id) ?? douroStationById(id);

  app.get("/demo/telemetry", (_req: Request, res: Response) => {
    res.json({ stations: getAllEarlyWarningStates() });
  });

  app.post("/demo/telemetry/tick", (_req: Request, res: Response) => {
    const stations = advanceAllStations();
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
