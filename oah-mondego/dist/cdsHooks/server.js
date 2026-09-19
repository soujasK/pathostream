import cors from "cors";
import express from "express";
import { pathToFileURL } from "node:url";
import { MONDEGO_REACH } from "../data/mondegoReach.js";
import { computeTransportForecast } from "../hydrology/advectionDispersion.js";
import { classifyWfdEcologicalStatus } from "../hydrology/wfdClassification.js";
import { buildForecastRiskAssessment } from "../fhir/riskAssessment.js";
import { discoveryManifest } from "./discovery.js";
import { evaluateExposure, getUpstreamState, resetUpstreamState, setUpstreamState, } from "./exposureEngine.js";
import { handleOrderSelect } from "./orderSelect.js";
import { handlePatientView } from "./patientView.js";
export function createServer() {
    const app = express();
    app.use(express.json());
    app.use(cors());
    app.get("/health", (_req, res) => {
        res.json({ status: "ok" });
    });
    app.get("/cds-services", (_req, res) => {
        res.json(discoveryManifest());
    });
    app.post("/cds-services/patient-view", (req, res) => {
        const request = req.body;
        res.json(handlePatientView(request));
    });
    app.post("/cds-services/order-select", (req, res) => {
        const request = req.body;
        res.json(handleOrderSelect(request));
    });
    // --- Demo-only scaffolding, mirrors the sibling Python service's
    // /demo/* endpoints: real backend state a demo frontend can drive,
    // nothing fabricated in a browser. ---
    app.post("/demo/simulate", (req, res) => {
        const body = req.body;
        const state = setUpstreamState(body.flagged ?? true, body.severityIndex ?? 0.8);
        res.json(state);
    });
    app.post("/demo/reset", (_req, res) => {
        resetUpstreamState();
        res.json({ status: "reset" });
    });
    app.get("/demo/state", (_req, res) => {
        res.json({ upstream: getUpstreamState(), evaluation: evaluateExposure() });
    });
    app.get("/demo/forecast", (_req, res) => {
        const evaluation = evaluateExposure();
        const forecast = evaluation?.forecast ??
            computeTransportForecast({ distanceKm: MONDEGO_REACH.distanceKm, meanVelocityMs: MONDEGO_REACH.meanVelocityMs });
        const wfd = evaluation?.wfd ?? classifyWfdEcologicalStatus(0);
        res.json({ reach: MONDEGO_REACH, forecast, wfd, evaluation });
    });
    app.get("/demo/forecast-bundle", (_req, res) => {
        const evaluation = evaluateExposure();
        const forecast = evaluation?.forecast ??
            computeTransportForecast({ distanceKm: MONDEGO_REACH.distanceKm, meanVelocityMs: MONDEGO_REACH.meanVelocityMs });
        const wfd = evaluation?.wfd ?? classifyWfdEcologicalStatus(0);
        const probability = evaluation?.probability ?? 0;
        const bundle = buildForecastRiskAssessment({ reach: MONDEGO_REACH, forecast, wfd, probability });
        res.json(bundle);
    });
    app.use((err, _req, res, _next) => {
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
