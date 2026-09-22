import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { resetAllStations, setStationState } from "../src/cdsHooks/exposureEngine.js";
import { createServer } from "../src/cdsHooks/server.js";
import { MONDEGO_STATIONS } from "../src/data/mondegoNetwork.js";
import { makeNormal, mulberry32 } from "../src/evaluation/prng.js";
import { buildForecastRiskAssessment } from "../src/fhir/riskAssessment.js";
import { computeTransportForecast } from "../src/hydrology/advectionDispersion.js";
import { ASSUMED_VELOCITY_LOG_SD, bandFactor, travelTimeBand } from "../src/hydrology/uncertainty.js";
import { classifyWfdEcologicalStatus } from "../src/hydrology/wfdClassification.js";

describe("travelTimeBand (sensitivity of an ETA to the placeholder velocity)", () => {
  it("brackets the point estimate symmetrically in log space", () => {
    const band = travelTimeBand(60);
    expect(band.lowMinutes).toBeLessThan(60);
    expect(band.highMinutes).toBeGreaterThan(60);
    expect(band.lowMinutes * band.highMinutes).toBeCloseTo(60 * 60, 8);
  });

  it("uses the documented assumption: about a factor of 2.3 either way at log-sd 0.5", () => {
    expect(ASSUMED_VELOCITY_LOG_SD).toBe(0.5);
    expect(bandFactor()).toBeCloseTo(Math.exp(1.6448536269514722 * 0.5), 12);
    expect(bandFactor()).toBeGreaterThan(2.2);
    expect(bandFactor()).toBeLessThan(2.4);
  });

  it("widens with the assumed uncertainty and collapses to the point estimate at zero", () => {
    const narrow = travelTimeBand(60, 0.2);
    const wide = travelTimeBand(60, 0.8);
    expect(wide.highMinutes - wide.lowMinutes).toBeGreaterThan(narrow.highMinutes - narrow.lowMinutes);
    expect(travelTimeBand(60, 0)).toMatchObject({ lowMinutes: 60, highMinutes: 60 });
  });

  it("matches a direct Monte Carlo of t = x / u with log-normal u: ~5% of draws below the band, ~5% above", () => {
    const distanceKm = 2;
    const medianVelocity = 0.36; // m/s
    const peakMinutes = (distanceKm * 1000) / medianVelocity / 60;
    const band = travelTimeBand(peakMinutes);

    const normal = makeNormal(mulberry32(2026));
    const n = 200_000;
    let below = 0;
    let above = 0;
    for (let i = 0; i < n; i++) {
      const velocity = medianVelocity * Math.exp(ASSUMED_VELOCITY_LOG_SD * normal());
      const minutes = (distanceKm * 1000) / velocity / 60;
      if (minutes < band.lowMinutes) below += 1;
      if (minutes > band.highMinutes) above += 1;
    }
    expect(below / n).toBeGreaterThan(0.045);
    expect(below / n).toBeLessThan(0.055);
    expect(above / n).toBeGreaterThan(0.045);
    expect(above / n).toBeLessThan(0.055);
  });
});

describe("the band reaches every place the ETA is shown", () => {
  const app = createServer({ cdsAuth: undefined });
  const SOURCE = MONDEGO_STATIONS[0]!;
  const TARGET = MONDEGO_STATIONS[2]!;

  beforeEach(() => resetAllStations());

  it("/demo/forecasts returns a peakBand that brackets each forecast's peak", async () => {
    await request(app).post("/demo/simulate").send({ stationId: SOURCE.id, flagged: true, severityIndex: 0.9 });
    const res = await request(app).get("/demo/forecasts");
    expect(res.body.forecasts.length).toBeGreaterThan(0);
    for (const f of res.body.forecasts as { transport: { peakTimeMinutes: number }; peakBand: { lowMinutes: number; highMinutes: number } }[]) {
      expect(f.peakBand.lowMinutes).toBeLessThan(f.transport.peakTimeMinutes);
      expect(f.peakBand.highMinutes).toBeGreaterThan(f.transport.peakTimeMinutes);
    }
  });

  it("the predicted patient-view card states the range and that it is not a calibrated interval", async () => {
    setStationState(SOURCE.id, true, 0.9, new Date(), "operator");
    const res = await request(app)
      .post("/cds-services/patient-view")
      .send({
        hookInstance: "x",
        hook: "patient-view",
        context: { userId: "u", patientId: "p" },
        prefetch: {
          patient: {
            resourceType: "Patient",
            id: "p",
            address: [{ extension: [{ url: "http://hl7.org/fhir/StructureDefinition/geolocation", extension: [{ url: "latitude", valueDecimal: TARGET.latitude }, { url: "longitude", valueDecimal: TARGET.longitude }] }] }],
          },
        },
      });
    const detail: string = res.body.cards[0].detail;
    expect(detail).toContain("a factor of about 2 either way");
    expect(detail).toContain("sensitivity range, not a calibrated interval");
  });

  it("the FHIR RiskAssessment rationale carries the same caveat", () => {
    const forecast = computeTransportForecast({ distanceKm: 2, meanVelocityMs: 0.36 });
    const resource = buildForecastRiskAssessment({
      source: SOURCE,
      target: TARGET,
      forecast,
      wfd: classifyWfdEcologicalStatus(0.7),
      meanVelocityMs: 0.36,
      probability: 0.5,
    });
    const rationale = resource.prediction[0]!.rationale!;
    expect(rationale).toContain("Sensitivity:");
    expect(rationale).toContain("not a calibrated interval");
  });
});
