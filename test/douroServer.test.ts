import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../src/cdsHooks/server.js";
import { DOURO_STATIONS } from "../src/data/douroNetwork.js";

const app = createServer();

const SOURCE = DOURO_STATIONS[0]!; // Zamora, Spain (most upstream)
const TARGET = DOURO_STATIONS[3]!; // Porto, Portugal (mouth)

describe("GET /demo/douro/stations", () => {
  it("lists all 4 real cross-border stations, Spain to the Atlantic", async () => {
    const res = await request(app).get("/demo/douro/stations");
    expect(res.body).toHaveLength(4);
    expect(res.body[0].id).toBe("ES-ZAMORA");
    expect(res.body.at(-1).id).toBe("PT-PORTO");
  });
});

describe("POST /demo/douro/simulate + GET /demo/douro/state", () => {
  beforeEach(async () => {
    await request(app).post("/demo/douro/reset");
  });

  it("rejects an unknown stationId", async () => {
    const res = await request(app).post("/demo/douro/simulate").send({ stationId: "not-a-real-station", flagged: true });
    expect(res.status).toBe(400);
  });

  it("confirms the flagged station itself immediately", async () => {
    await request(app).post("/demo/douro/simulate").send({ stationId: SOURCE.id, flagged: true, severityIndex: 0.9 });
    const res = await request(app).get("/demo/douro/state");
    const evaluation = res.body.evaluations.find((e: { stationId: string }) => e.stationId === SOURCE.id);
    expect(evaluation.phase).toBe("confirmed");
    expect(evaluation.isOwnFlag).toBe(true);
  });

  it("does not touch the Mondego network's own state (independent exposure engines)", async () => {
    await request(app).post("/demo/douro/simulate").send({ stationId: SOURCE.id, flagged: true, severityIndex: 0.9 });
    const mondegoState = await request(app).get("/demo/state");
    expect(mondegoState.body.evaluations).toEqual([]);
  });

  it("predicts a downstream arrival at Porto once Zamora (Spain) is flagged", async () => {
    await request(app).post("/demo/douro/simulate").send({ stationId: SOURCE.id, flagged: true, severityIndex: 0.9 });
    const res = await request(app).get("/demo/douro/forecasts");
    const forecast = res.body.forecasts.find((f: { targetStationId: string }) => f.targetStationId === TARGET.id);
    expect(forecast).toBeDefined();
    expect(forecast.sourceStationId).toBe(SOURCE.id);
    // Real haversine straight-line distance Zamora -> Porto (~253.7 km) --
    // computed, not assumed; the actual river path is longer still.
    expect(forecast.transport.distanceKm).toBeGreaterThan(200);
  });

  it("serializes the cross-border forecast as a real FHIR RiskAssessment", async () => {
    await request(app).post("/demo/douro/simulate").send({ stationId: SOURCE.id, flagged: true, severityIndex: 0.9 });
    const res = await request(app).get("/demo/douro/forecast-bundle");
    expect(res.body.resourceType).toBe("Bundle");
    const resource = res.body.entry[0].resource;
    expect(resource.resourceType).toBe("RiskAssessment");
    expect(resource.basis[0].display).toBe(SOURCE.name);
  });
});

describe("Douro and Mondego share the telemetry/early-warning layer", () => {
  it("/demo/telemetry includes stations from both networks", async () => {
    const res = await request(app).get("/demo/telemetry");
    const ids = res.body.stations.map((s: { stationId: string }) => s.stationId);
    expect(ids).toContain("ES-ZAMORA");
    expect(ids).toContain("PT-SANTA-CLARA");
  });

  it("accepts a Douro stationId for /demo/telemetry/inject", async () => {
    const res = await request(app).post("/demo/telemetry/inject").send({ stationId: "ES-ZAMORA" });
    expect(res.status).toBe(200);
  });
});
