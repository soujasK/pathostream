import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { advanceAllStations, injectTelemetryEvent, resetAllTelemetry } from "../src/analytics/earlyWarningEngine.js";
import { engineFor } from "../src/cdsHooks/catchmentEngines.js";
import { createServer } from "../src/cdsHooks/server.js";
import {
  ALL_STATIONS,
  CATCHMENTS,
  catchmentById,
  catchmentOfStation,
  COUNTRIES_COVERED,
  routePrefix,
} from "../src/data/catchments.js";
import { haversineKm } from "../src/hydrology/propagation.js";

const app = createServer();

function river(id: string) {
  const c = catchmentById(id);
  if (!c) throw new Error(`no catchment ${id}`);
  return c;
}

function patientViewRequest(latitude: number, longitude: number) {
  return {
    hookInstance: "t",
    hook: "patient-view",
    context: { userId: "Practitioner/demo-md", patientId: "demo-patient" },
    prefetch: {
      patient: {
        resourceType: "Patient",
        address: [
          {
            extension: [
              {
                url: "http://hl7.org/fhir/StructureDefinition/geolocation",
                extension: [
                  { url: "latitude", valueDecimal: latitude },
                  { url: "longitude", valueDecimal: longitude },
                ],
              },
            ],
          },
        ],
      },
    },
  };
}

beforeEach(() => {
  resetAllTelemetry();
  for (const c of CATCHMENTS) engineFor(c.id).resetAllStations();
});

describe("catchment registry integrity", () => {
  it("registers Mondego, Douro, Tagus, Danube, Rhine, Elbe and Oder", () => {
    expect(CATCHMENTS.map((c) => c.id)).toEqual(["mondego", "douro", "tagus", "danube", "rhine", "elbe", "oder"]);
  });

  it("has no duplicate station ids across rivers", () => {
    const ids = ALL_STATIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers 13 EU member states", () => {
    expect(COUNTRIES_COVERED).toEqual(["AT", "BG", "CZ", "DE", "ES", "FR", "HR", "HU", "NL", "PL", "PT", "RO", "SK"]);
  });

  it.each(CATCHMENTS.map((c) => [c.id, c] as const))("%s: flow order matches its stations and every station is verified", (_id, c) => {
    expect(c.flowOrder).toEqual(c.stations.map((s) => s.id));
    expect(c.stations.length).toBeGreaterThanOrEqual(4);
    for (const s of c.stations) {
      expect(s.verified).toBe(true);
      expect(s.verificationNote.length).toBeGreaterThan(30);
      expect(s.country).toBeDefined();
    }
  });

  it.each(CATCHMENTS.map((c) => [c.id, c] as const))("%s: stations sit in Europe and consecutive stations are plausibly spaced", (_id, c) => {
    for (const s of c.stations) {
      expect(s.latitude).toBeGreaterThan(35);
      expect(s.latitude).toBeLessThan(72);
      expect(s.longitude).toBeGreaterThan(-12);
      expect(s.longitude).toBeLessThan(35);
    }
    for (let i = 1; i < c.stations.length; i++) {
      const a = c.stations[i - 1]!;
      const b = c.stations[i]!;
      const km = haversineKm(
        { stationId: a.id, latitude: a.latitude, longitude: a.longitude },
        { stationId: b.id, latitude: b.latitude, longitude: b.longitude },
      );
      // Distinct, not identical (Mondego's two ESTIMATED park coordinates are
      // genuinely only ~70 m apart) -- this catches a copy-paste duplicate.
      expect(km).toBeGreaterThan(0.01);
      expect(km).toBeLessThan(700);
    }
  });

  it.each(CATCHMENTS.map((c) => [c.id, c] as const))("%s: carries provenance rows for the dashboard's disclosure panel", (_id, c) => {
    expect(c.provenance.length).toBeGreaterThanOrEqual(5);
    for (const row of c.provenance) {
      expect(row.claim.length).toBeGreaterThan(5);
      expect(row.note.length).toBeGreaterThan(20);
    }
  });

  it("names a hospital ONLY for Coimbra -- no invented hospitals anywhere else", () => {
    const withHospital = CATCHMENTS.filter((c) => c.hospitalAnchor !== undefined).map((c) => c.id);
    expect(withHospital).toEqual(["mondego"]);
  });

  it("finds a station's river by id", () => {
    expect(catchmentOfStation("AT-VIENNA")?.id).toBe("danube");
    expect(catchmentOfStation("PT-LISBON")?.id).toBe("tagus");
    expect(catchmentOfStation("NOT-A-STATION")).toBeUndefined();
  });
});

describe("river direction (order follows the river's confirmed course)", () => {
  const lat = (id: string) => river(id).stations.map((s) => s.latitude);
  const lon = (id: string) => river(id).stations.map((s) => s.longitude);
  const strictly = (xs: number[], dir: "up" | "down") =>
    xs.every((x, i) => i === 0 || (dir === "up" ? x > xs[i - 1]! : x < xs[i - 1]!));

  it("Rhine flows north through France/Germany/Netherlands: latitude increases", () => {
    expect(strictly(lat("rhine"), "up")).toBe(true);
  });
  it("Elbe flows north-west from Czechia to Hamburg: longitude decreases, latitude increases", () => {
    expect(strictly(lon("elbe"), "down")).toBe(true);
    expect(strictly(lat("elbe"), "up")).toBe(true);
  });
  it("Oder flows north to the Baltic: latitude increases", () => {
    expect(strictly(lat("oder"), "up")).toBe(true);
  });
  it("Tagus flows west to Lisbon: longitude decreases", () => {
    expect(strictly(lon("tagus"), "down")).toBe(true);
  });
  it("Danube flows east from Passau to Budapest (then turns south, so only that reach is asserted)", () => {
    expect(strictly(lon("danube").slice(0, 4), "up")).toBe(true);
    expect(river("danube").stations[0]!.name).toBe("Passau");
    expect(river("danube").stations.at(-1)!.name).toBe("Galați");
  });
  it("Danube alone spans 7 countries", () => {
    expect(new Set(river("danube").stations.map((s) => s.country)).size).toBe(7);
  });
});

describe("HTTP: every river gets the same route family", () => {
  it("GET /demo/catchments lists every river with its provenance and the countries covered", async () => {
    const res = await request(app).get("/demo/catchments");
    expect(res.status).toBe(200);
    expect(res.body.catchments).toHaveLength(CATCHMENTS.length);
    expect(res.body.countriesCovered).toHaveLength(13);
    const danube = res.body.catchments.find((c: { id: string }) => c.id === "danube");
    expect(danube.stationCount).toBe(7);
    expect(danube.provenance.length).toBeGreaterThan(0);
    expect(danube.hospitalAnchor).toBeNull();
  });

  it.each(CATCHMENTS.map((c) => [c.id, c] as const))("%s: serves its stations and confirms a flagged one", async (_id, c) => {
    const prefix = routePrefix(c);
    const stations = await request(app).get(`${prefix}/stations`);
    expect(stations.body).toHaveLength(c.stations.length);

    await request(app).post(`${prefix}/simulate`).send({ stationId: c.stations[0]!.id, flagged: true, severityIndex: 0.9 });
    const state = await request(app).get(`${prefix}/state`);
    const first = state.body.evaluations.find((e: { stationId: string }) => e.stationId === c.stations[0]!.id);
    expect(first.phase).toBe("confirmed");
    // ...and a forecast exists for every station downstream of it.
    const forecasts = await request(app).get(`${prefix}/forecasts`);
    expect(forecasts.body.forecasts).toHaveLength(c.stations.length - 1);
  });

  it("rivers are isolated: flagging the Danube leaves every other river untouched", async () => {
    await request(app).post("/demo/danube/simulate").send({ stationId: "DE-PASSAU", flagged: true, severityIndex: 0.9 });
    for (const c of CATCHMENTS.filter((x) => x.id !== "danube")) {
      const state = await request(app).get(`${routePrefix(c)}/state`);
      expect(state.body.evaluations).toEqual([]);
    }
  });

  it("a big-river forecast is days, not minutes (Passau -> Galati, straight-line lower bound)", async () => {
    await request(app).post("/demo/danube/simulate").send({ stationId: "DE-PASSAU", flagged: true, severityIndex: 0.9 });
    const forecasts = await request(app).get("/demo/danube/forecasts");
    const last = forecasts.body.forecasts.find((f: { targetStationId: string }) => f.targetStationId === "RO-GALATI");
    expect(last.transport.distanceKm).toBeGreaterThan(900);
    expect(last.transport.peakTimeMinutes).toBeGreaterThan(60 * 24 * 5); // > 5 days at 1 m/s
  });

  it("an unknown station is rejected by a river's own simulate route", async () => {
    const res = await request(app).post("/demo/rhine/simulate").send({ stationId: "AT-VIENNA", flagged: true });
    expect(res.status).toBe(400); // Vienna is a Danube station, not a Rhine one
  });
});

describe("clinician cards work at any river, and name a hospital only in Coimbra", () => {
  it("Vienna: a confirmed Danube station fires a critical card that says 'your institution's protocol', not a hospital", async () => {
    const vienna = river("danube").stations.find((s) => s.id === "AT-VIENNA")!;
    await request(app).post("/demo/danube/simulate").send({ stationId: vienna.id, flagged: true, severityIndex: 0.9 });
    const res = await request(app).post("/cds-services/patient-view").send(patientViewRequest(vienna.latitude, vienna.longitude));
    expect(res.body.cards).toHaveLength(1);
    expect(res.body.cards[0].indicator).toBe("critical");
    expect(res.body.cards[0].detail).toContain("your institution's protocol");
    expect(res.body.cards[0].detail).not.toContain("Centro Hospitalar");
    expect(res.body.cards[0].source.label).toContain("Danube");
  });

  it("Coimbra still names CHUC", async () => {
    const parque = river("mondego").stations[2]!;
    await request(app).post("/demo/simulate").send({ stationId: parque.id, flagged: true, severityIndex: 0.9 });
    const res = await request(app).post("/cds-services/patient-view").send(patientViewRequest(parque.latitude, parque.longitude));
    expect(res.body.cards[0].detail).toContain("Centro Hospitalar e Universitário de Coimbra (CHUC)");
  });

  it("Lisbon: a patient there gets a downstream warning when the Tagus is contaminated upstream at Toledo", async () => {
    const lisbon = river("tagus").stations.find((s) => s.id === "PT-LISBON")!;
    await request(app).post("/demo/tagus/simulate").send({ stationId: "ES-TOLEDO", flagged: true, severityIndex: 0.9 });
    const res = await request(app).post("/cds-services/patient-view").send(patientViewRequest(lisbon.latitude, lisbon.longitude));
    expect(res.body.cards).toHaveLength(1);
    expect(res.body.cards[0].indicator).toBe("warning");
    expect(res.body.cards[0].detail).toContain("Toledo");
  });

  it("the predicted card uses the RIVER's own assumed velocity, not Mondego's", async () => {
    const lisbon = river("tagus").stations.find((s) => s.id === "PT-LISBON")!;
    await request(app).post("/demo/tagus/simulate").send({ stationId: "ES-TOLEDO", flagged: true, severityIndex: 0.9 });
    const res = await request(app).post("/cds-services/patient-view").send(patientViewRequest(lisbon.latitude, lisbon.longitude));
    expect(res.body.cards[0].detail).toContain("assumed 1 m/s");
    expect(res.body.cards[0].detail).not.toContain("0.36 m/s");
  });
});

describe("statistical auto-escalation works for a newly added river", () => {
  it("a sustained anomaly at a Danube station escalates into the Danube engine only", () => {
    injectTelemetryEvent("DE-PASSAU");
    for (let i = 0; i < 20; i++) advanceAllStations();
    const state = engineFor("danube").getStationState("DE-PASSAU");
    expect(state.flagged).toBe(true);
    expect(state.confirmedVia).toBe("statistical-detection");
    expect(engineFor("rhine").getAllStationStates().size).toBe(0);
    expect(engineFor("mondego").getAllStationStates().size).toBe(0);
  });

  it("a river's Reset clears its telemetry too, so no 'Escalated' latch outlives the flag it created", async () => {
    injectTelemetryEvent("DE-COLOGNE");
    for (let i = 0; i < 20; i++) advanceAllStations();
    expect(engineFor("rhine").getStationState("DE-COLOGNE").flagged).toBe(true);

    await request(app).post("/demo/rhine/reset");

    expect(engineFor("rhine").getStationState("DE-COLOGNE").flagged).toBe(false);
    const telemetry = await request(app).get("/demo/telemetry");
    const cologne = telemetry.body.stations.find((s: { stationId: string }) => s.stationId === "DE-COLOGNE");
    expect(cologne.autoEscalated).toBe(false);
    expect(cologne.eventInjected).toBe(false);
  });
});
