import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { pathToFileURL } from "node:url";
import { MONDEGO_CATCHMENT_ID, MONDEGO_STATIONS, stationById } from "../data/mondegoNetwork.js";
import { buildForecastRiskAssessment } from "../fhir/riskAssessment.js";
import { discoveryManifest } from "./discovery.js";
import {
  evaluateStationExposure,
  getActiveForecasts,
  getAllStationStates,
  resetAllStations,
  setStationState,
} from "./exposureEngine.js";
import { handleOrderSelect } from "./orderSelect.js";
import { handlePatientView } from "./patientView.js";
import type { OrderSelectRequest, PatientViewRequest } from "./types.js";

const NETWORK_MEAN_VELOCITY_MS = 0.36;

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

  // --- Demo-only scaffolding, mirrors the sibling Python service's
  // /demo/* endpoints: real backend state a demo frontend can drive,
  // nothing fabricated in a browser. ---

  app.get("/demo/stations", (_req: Request, res: Response) => {
    res.json(MONDEGO_STATIONS);
  });

  app.post("/demo/simulate", (req: Request, res: Response) => {
    const body = req.body as { stationId?: string; flagged?: boolean; severityIndex?: number; elapsedMinutes?: number };
    if (!body.stationId || !stationById(body.stationId)) {
      res.status(400).json({ error: `Unknown stationId '${body.stationId}'` });
      return;
    }
    // `elapsedMinutes` explicitly backdates the simulated flag time so a
    // demo can jump straight to the predicted/confirmed/cleared phase
    // without waiting out the real transport window. This sets the CLOCK,
    // not the science -- the same transport model and phase boundaries
    // apply regardless of which phase you jump to.
    const flaggedAt = new Date(Date.now() - (body.elapsedMinutes ?? 0) * 60_000);
    const state = setStationState(body.stationId, body.flagged ?? true, body.severityIndex ?? 0.8, flaggedAt);
    res.json({ stationId: body.stationId, ...state });
  });

  app.post("/demo/reset", (_req: Request, res: Response) => {
    resetAllStations();
    res.json({ status: "reset" });
  });

  app.get("/demo/state", (_req: Request, res: Response) => {
    const states = Array.from(getAllStationStates().entries()).map(([stationId, state]) => ({ stationId, ...state }));
    const evaluations = MONDEGO_STATIONS.map((s) => evaluateStationExposure(s.id)).filter((e) => e !== null);
    res.json({ catchmentId: MONDEGO_CATCHMENT_ID, stations: states, evaluations });
  });

  app.get("/demo/forecasts", (_req: Request, res: Response) => {
    const forecasts = getActiveForecasts().map((f) => ({
      sourceStationId: f.sourceStationId,
      targetStationId: f.targetStationId,
      transport: f.transport,
    }));
    res.json({ catchmentId: MONDEGO_CATCHMENT_ID, forecasts });
  });

  app.get("/demo/forecast-bundle", (_req: Request, res: Response) => {
    const now = new Date();
    const entries = getActiveForecasts().flatMap((f) => {
      // evaluateStationExposure(target) recomputes the same forecast this
      // target is the object of, giving both its probability and the
      // source station's WFD classification in one call -- skip this
      // forecast entirely (rather than guessing) if that lookup somehow
      // disagrees with getActiveForecasts's own result.
      const evaluation = evaluateStationExposure(f.targetStationId);
      if (!evaluation || evaluation.isOwnFlag || evaluation.sourceStationId !== f.sourceStationId) return [];

      const resource = buildForecastRiskAssessment({
        source: stationById(f.sourceStationId)!,
        target: stationById(f.targetStationId)!,
        forecast: f.transport,
        wfd: evaluation.wfd,
        meanVelocityMs: NETWORK_MEAN_VELOCITY_MS,
        probability: evaluation.probability,
        now,
      });
      return [{ resource }];
    });
    res.json({ resourceType: "Bundle", type: "collection", entry: entries });
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
