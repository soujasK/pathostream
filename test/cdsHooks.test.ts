import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../src/cdsHooks/server.js";
import { ALL_STATIONS } from "../src/data/catchments.js";
import { MONDEGO_STATIONS } from "../src/data/mondegoNetwork.js";
import { resetAllStations, setStationState } from "../src/cdsHooks/exposureEngine.js";
import { handlePatientView } from "../src/cdsHooks/patientView.js";
import type { PatientViewRequest } from "../src/cdsHooks/types.js";

const app = createServer();

const SOURCE = MONDEGO_STATIONS[0]!; // Ponte de Santa Clara (most upstream)
const TARGET = MONDEGO_STATIONS[2]!; // Parque Verde do Mondego (two hops downstream)

function patientViewRequest(latitude: number, longitude: number) {
  return {
    hookInstance: "test-instance-1",
    hook: "patient-view",
    context: { userId: "Practitioner/demo-md", patientId: "demo-patient" },
    prefetch: {
      patient: {
        resourceType: "Patient",
        id: "demo-patient",
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

interface StateEvaluation {
  stationId: string;
  phase: string;
  elapsedMinutes: number;
}

async function evaluationFor(stationId: string): Promise<StateEvaluation | undefined> {
  const res = await request(app).get("/demo/state");
  return (res.body.evaluations as StateEvaluation[]).find((e) => e.stationId === stationId);
}

beforeEach(() => {
  resetAllStations();
});

describe("GET /cds-services", () => {
  it("advertises both patient-view and order-select", async () => {
    const res = await request(app).get("/cds-services");
    expect(res.status).toBe(200);
    const hooks = res.body.services.map((s: { hook: string }) => s.hook);
    expect(hooks).toContain("patient-view");
    expect(hooks).toContain("order-select");
  });
});

describe("GET /demo/stations", () => {
  it("lists all 6 real network stations in upstream-to-downstream order", async () => {
    const res = await request(app).get("/demo/stations");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(6);
    expect(res.body[0].id).toBe(SOURCE.id);
    expect(res.body.every((s: { verified: boolean }) => s.verified === true)).toBe(true);
  });
});

describe("POST /demo/simulate", () => {
  it("rejects an unknown stationId", async () => {
    const res = await request(app).post("/demo/simulate").send({ stationId: "not-a-real-station", flagged: true });
    expect(res.status).toBe(400);
  });

  it("defaults to elapsed ~0 (predicted phase downstream) when elapsedMinutes is omitted", async () => {
    await request(app).post("/demo/simulate").send({ stationId: SOURCE.id, flagged: true, severityIndex: 0.9 });
    const evaluation = await evaluationFor(TARGET.id);
    expect(evaluation?.phase).toBe("predicted");
    expect(evaluation?.elapsedMinutes).toBeLessThan(1);
  });

  it("jumps straight to the confirmed phase when backdated past the arrival boundary", async () => {
    // Ponte de Santa Clara -> Parque Verde do Mondego: arrival ~5.4min,
    // clearance ~23.3min (real coordinates, 0.36 m/s) -- 15min sits
    // between them.
    await request(app)
      .post("/demo/simulate")
      .send({ stationId: SOURCE.id, flagged: true, severityIndex: 0.9, elapsedMinutes: 15 });
    const evaluation = await evaluationFor(TARGET.id);
    expect(evaluation?.phase).toBe("confirmed");
  });

  it("jumps straight to the cleared phase when backdated far enough", async () => {
    await request(app)
      .post("/demo/simulate")
      .send({ stationId: SOURCE.id, flagged: true, severityIndex: 0.9, elapsedMinutes: 30 });
    const evaluation = await evaluationFor(TARGET.id);
    expect(evaluation?.phase).toBe("cleared");
  });

  async function confirmedViaFor(stationId: string): Promise<string | undefined> {
    const res = await request(app).get("/demo/state");
    return (res.body.stations as { stationId: string; confirmedVia: string }[]).find((s) => s.stationId === stationId)
      ?.confirmedVia;
  }

  it("records a fresh manual report as operator-confirmed", async () => {
    await request(app).post("/demo/simulate").send({ stationId: SOURCE.id, flagged: true, severityIndex: 0.9 });
    expect(await confirmedViaFor(SOURCE.id)).toBe("operator");
  });

  it("keeps a station's confirmation provenance when re-flagged to fast-forward its clock", async () => {
    setStationState(SOURCE.id, true, 0.7, new Date(), "statistical-detection");
    await request(app)
      .post("/demo/simulate")
      .send({ stationId: SOURCE.id, flagged: true, severityIndex: 0.7, elapsedMinutes: 20 });
    expect(await confirmedViaFor(SOURCE.id)).toBe("statistical-detection");
  });
});

describe("POST /cds-services/patient-view", () => {
  it("is silent when no station is flagged", async () => {
    const res = await request(app).post("/cds-services/patient-view").send(patientViewRequest(TARGET.latitude, TARGET.longitude));
    expect(res.status).toBe(200);
    expect(res.body.cards).toEqual([]);
  });

  it("is silent for a patient address far from every monitored river", async () => {
    await request(app).post("/demo/simulate").send({ stationId: SOURCE.id, flagged: true, severityIndex: 0.9 });
    const res = await request(app).post("/cds-services/patient-view").send(patientViewRequest(37.9838, 23.7275)); // Athens: no monitored river station within 2 km
    expect(res.body.cards).toEqual([]);
  });

  it("fires a critical card immediately for a patient at the flagged station itself", async () => {
    await request(app).post("/demo/simulate").send({ stationId: TARGET.id, flagged: true, severityIndex: 0.9 });
    const res = await request(app).post("/cds-services/patient-view").send(patientViewRequest(TARGET.latitude, TARGET.longitude));
    expect(res.body.cards).toHaveLength(1);
    expect(res.body.cards[0].indicator).toBe("critical");
  });

  it("fires a warning (predicted) card for a downstream station before its arrival window", async () => {
    await request(app).post("/demo/simulate").send({ stationId: SOURCE.id, flagged: true, severityIndex: 0.9 });
    const res = await request(app).post("/cds-services/patient-view").send(patientViewRequest(TARGET.latitude, TARGET.longitude));

    expect(res.body.cards).toHaveLength(1);
    expect(res.body.cards[0].indicator).toBe("warning");
    expect(res.body.cards[0].suggestions).toEqual([]);
    expect(res.body.cards[0].detail).toContain(SOURCE.name);
  });

  it("does not fire a card for a station upstream of the only flagged station", async () => {
    await request(app).post("/demo/simulate").send({ stationId: TARGET.id, flagged: true, severityIndex: 0.9 });
    const res = await request(app).post("/cds-services/patient-view").send(patientViewRequest(SOURCE.latitude, SOURCE.longitude));
    expect(res.body.cards).toEqual([]);
  });

  describe("card provenance wording (operator report vs statistical auto-escalation)", () => {
    it("describes an operator-reported flag as an active biohazard signature", async () => {
      await request(app).post("/demo/simulate").send({ stationId: TARGET.id, flagged: true, severityIndex: 0.9 });
      const res = await request(app).post("/cds-services/patient-view").send(patientViewRequest(TARGET.latitude, TARGET.longitude));
      expect(res.body.cards[0].detail).toContain("currently shows an active biohazard signature");
      expect(res.body.cards[0].detail).not.toContain("auto-escalated");
    });

    it("does NOT claim a direct biohazard signature for a statistically auto-escalated flag", async () => {
      setStationState(TARGET.id, true, 0.7, new Date(), "statistical-detection");
      const res = await request(app).post("/cds-services/patient-view").send(patientViewRequest(TARGET.latitude, TARGET.longitude));
      const detail: string = res.body.cards[0].detail;
      expect(detail).toContain("auto-escalated from a sustained statistical turbidity anomaly");
      expect(detail).toContain("not a direct pathogen or biohazard measurement");
      expect(detail).not.toContain("currently shows an active biohazard signature");
    });

    it("carries the same honesty into the downstream (predicted) card for an auto-escalated source", async () => {
      setStationState(SOURCE.id, true, 0.7, new Date(), "statistical-detection");
      const res = await request(app).post("/cds-services/patient-view").send(patientViewRequest(TARGET.latitude, TARGET.longitude));
      const detail: string = res.body.cards[0].detail;
      expect(res.body.cards[0].indicator).toBe("warning");
      expect(detail).toContain(`${SOURCE.name} was auto-escalated`);
      expect(detail).not.toContain("currently shows an active biohazard signature");
    });
  });
});

describe("GET /demo/forecasts and /demo/forecast-bundle", () => {
  it("lists a forecast for every downstream station once the most-upstream one is flagged", async () => {
    await request(app).post("/demo/simulate").send({ stationId: SOURCE.id, flagged: true, severityIndex: 0.9 });
    const res = await request(app).get("/demo/forecasts");
    expect(res.body.forecasts).toHaveLength(5); // all 5 stations downstream of SOURCE
  });

  it("serializes the same forecasts as real FHIR RiskAssessment resources", async () => {
    await request(app).post("/demo/simulate").send({ stationId: SOURCE.id, flagged: true, severityIndex: 0.9 });
    const res = await request(app).get("/demo/forecast-bundle");
    expect(res.body.resourceType).toBe("Bundle");
    expect(res.body.entry).toHaveLength(5);
    for (const entry of res.body.entry) {
      expect(entry.resource.resourceType).toBe("RiskAssessment");
      expect(entry.resource.prediction[0].probabilityDecimal).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("POST /cds-services/order-select", () => {
  function orderSelectRequest(draftResourceTypes: Array<{ resourceType: string; loincCode?: string }>) {
    return {
      hookInstance: "test-instance-2",
      hook: "order-select",
      context: {
        userId: "Practitioner/demo-md",
        patientId: "demo-patient",
        selections: [],
        draftOrders: {
          resourceType: "Bundle",
          entry: draftResourceTypes.map((d) => ({
            resource: {
              resourceType: d.resourceType,
              ...(d.loincCode ? { code: { coding: [{ system: "http://loinc.org", code: d.loincCode }] } } : {}),
            },
          })),
        },
      },
    };
  }

  it("is silent when no station is in a confirmed exposure window", async () => {
    const res = await request(app)
      .post("/cds-services/order-select")
      .send(orderSelectRequest([{ resourceType: "MedicationRequest" }]));
    expect(res.body.cards).toEqual([]);
  });

  it("is silent when the draft order isn't a medication request", async () => {
    await request(app).post("/demo/simulate").send({ stationId: TARGET.id, flagged: true, severityIndex: 0.9 });
    const res = await request(app)
      .post("/cds-services/order-select")
      .send(orderSelectRequest([{ resourceType: "ServiceRequest" }]));
    expect(res.body.cards).toEqual([]);
  });

  it("does not re-suggest the panel if it's already in the draft orders", async () => {
    await request(app).post("/demo/simulate").send({ stationId: TARGET.id, flagged: true, severityIndex: 0.9 });
    const res = await request(app)
      .post("/cds-services/order-select")
      .send(
        orderSelectRequest([
          { resourceType: "MedicationRequest" },
          { resourceType: "ServiceRequest", loincCode: "82195-9" },
        ]),
      );
    expect(res.body.cards).toEqual([]);
  });
});

describe("GET/POST /demo/telemetry (EWMA early-warning layer)", () => {
  it("lists every station of every river with no history before any tick", async () => {
    const res = await request(app).get("/demo/telemetry");
    expect(res.body.stations).toHaveLength(ALL_STATIONS.length);
    expect(res.body.stations.every((s: { latest: unknown }) => s.latest === null)).toBe(true);
  });

  it("advances every station's tick count on POST /demo/telemetry/tick", async () => {
    await request(app).post("/demo/telemetry/tick");
    const res = await request(app).post("/demo/telemetry/tick");
    const target = res.body.stations.find((s: { stationId: string }) => s.stationId === TARGET.id);
    expect(target.tick).toBe(2);
    expect(target.latest).not.toBeNull();
  });

  it("rejects an unknown stationId on inject and clear", async () => {
    const injectRes = await request(app).post("/demo/telemetry/inject").send({ stationId: "not-a-real-station" });
    expect(injectRes.status).toBe(400);
    const clearRes = await request(app).post("/demo/telemetry/clear").send({ stationId: "not-a-real-station" });
    expect(clearRes.status).toBe(400);
  });

  it("eventually flags an out-of-control reading after an injected event, well before an unflagged station", async () => {
    await request(app).post("/demo/telemetry/inject").send({ stationId: TARGET.id });
    let targetOutOfControl = false;
    for (let i = 0; i < 40 && !targetOutOfControl; i++) {
      const res = await request(app).post("/demo/telemetry/tick");
      const target = res.body.stations.find((s: { stationId: string }) => s.stationId === TARGET.id);
      targetOutOfControl = target.latest?.outOfControl === true;
    }
    expect(targetOutOfControl).toBe(true);

    const finalState = await request(app).get("/demo/telemetry");
    const unflagged = finalState.body.stations.find((s: { stationId: string }) => s.stationId === SOURCE.id);
    expect(unflagged.latest?.outOfControl).toBe(false);
  });

  it("POST /demo/reset also clears telemetry state", async () => {
    await request(app).post("/demo/telemetry/inject").send({ stationId: TARGET.id });
    await request(app).post("/demo/telemetry/tick");
    await request(app).post("/demo/reset");
    const res = await request(app).get("/demo/telemetry");
    const target = res.body.stations.find((s: { stationId: string }) => s.stationId === TARGET.id);
    expect(target.tick).toBe(0);
    expect(target.eventInjected).toBe(false);
  });
});

describe("evaluation latency", () => {
  // Measures `handlePatientView` directly, in-process -- HTTP/Express/
  // network round-trip time is a deployment concern, not a property of the
  // deterministic evaluation logic itself, so it's excluded here.
  it("evaluates patient-view in under 35ms, deterministic path, warmed up", () => {
    setStationState(TARGET.id, true, 0.9);
    const body = patientViewRequest(TARGET.latitude, TARGET.longitude) as PatientViewRequest;

    // Warm up the JIT with a few throwaway calls before timing, same as
    // any realistic "steady state" latency measurement would.
    for (let i = 0; i < 20; i++) handlePatientView(body);

    const samples: number[] = [];
    for (let i = 0; i < 50; i++) {
      const start = performance.now();
      handlePatientView(body);
      samples.push(performance.now() - start);
    }
    const maxMs = Math.max(...samples);
    const avgMs = samples.reduce((a, b) => a + b, 0) / samples.length;

    // Report what was actually measured rather than asserting blindly.
    // eslint-disable-next-line no-console
    console.log(`patient-view evaluation: avg=${avgMs.toFixed(3)}ms max=${maxMs.toFixed(3)}ms (n=50)`);
    expect(maxMs).toBeLessThan(35);
  });
});
