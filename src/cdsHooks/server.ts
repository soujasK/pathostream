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
import { buildForecastRiskAssessment } from "../fhir/riskAssessment.js";
import { engineFor } from "./catchmentEngines.js";
import { discoveryManifest } from "./discovery.js";
import type { ExposureEngine } from "./exposureEngine.js";
import { handleOrderSelect } from "./orderSelect.js";
import { handlePatientView } from "./patientView.js";
import type { OrderSelectRequest, PatientViewRequest } from "./types.js";

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
  // drive, nothing fabricated in a browser. One route family per river in
  // the registry (data/catchments.ts): Mondego keeps the original
  // un-prefixed /demo/* paths for backward compatibility, every other
  // river is under /demo/<id>/*. The dashboard builds its river switcher,
  // Europe map and disclosure panel from /demo/catchments. ---

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
