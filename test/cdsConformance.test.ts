import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAllTelemetry } from "../src/analytics/earlyWarningEngine.js";
import { discoveryManifest, ORDER_SELECT_SERVICE_ID, PATIENT_VIEW_SERVICE_ID } from "../src/cdsHooks/discovery.js";
import { resetAllStations, setStationState } from "../src/cdsHooks/exposureEngine.js";
import { feedbackRecords, feedbackSummary, OVERRIDE_REASON_SYSTEM, resetFeedback } from "../src/cdsHooks/feedback.js";
import { createServer } from "../src/cdsHooks/server.js";
import { MONDEGO_STATIONS } from "../src/data/mondegoNetwork.js";

const app = createServer({ cdsAuth: undefined });
const SOURCE = MONDEGO_STATIONS[0]!;
const TARGET = MONDEGO_STATIONS[2]!;

function patientViewBody(latitude: number, longitude: number, patientId = "demo-patient") {
  return {
    hookInstance: "11111111-1111-4111-8111-111111111111",
    hook: "patient-view",
    context: { userId: "Practitioner/demo-md", patientId },
    prefetch: {
      patient: {
        resourceType: "Patient",
        id: patientId,
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

function orderSelectBody() {
  return {
    hookInstance: "22222222-2222-4222-8222-222222222222",
    hook: "order-select",
    context: {
      userId: "Practitioner/demo-md",
      patientId: "demo-patient",
      selections: ["MedicationRequest/1"],
      draftOrders: { resourceType: "Bundle", entry: [{ resource: { resourceType: "MedicationRequest", id: "1" } }] },
    },
  };
}

interface AnyCard {
  uuid: string;
  summary: string;
  indicator: string;
  detail: string;
  source: { label: string };
  suggestions: { label: string; uuid: string; actions: { type: string; resource?: { resourceType: string; subject?: { reference: string } } }[] }[];
  overrideReasons: { system: string; code: string; display: string }[];
}

/** CDS Hooks 2.0 card constraints (verified against cds-hooks.hl7.org/2.0). */
function expectConformingCard(card: AnyCard) {
  expect(typeof card.uuid).toBe("string");
  expect(card.uuid.length).toBeGreaterThan(0);
  expect(card.summary.length).toBeLessThan(140); // spec: "<140-character summary"
  expect(["info", "warning", "critical"]).toContain(card.indicator);
  expect(typeof card.detail).toBe("string");
  expect(card.source.label.length).toBeGreaterThan(0); // source.label REQUIRED
  for (const suggestion of card.suggestions) {
    expect(suggestion.label.length).toBeGreaterThan(0); // suggestion.label REQUIRED
    expect(suggestion.uuid.length).toBeGreaterThan(0);
    for (const action of suggestion.actions) {
      expect(["create", "update", "delete"]).toContain(action.type);
      if (action.resource?.resourceType === "ServiceRequest") {
        expect(action.resource.subject?.reference).toMatch(/^Patient\/.+/); // FHIR R4 ServiceRequest.subject 1..1
      }
    }
  }
  expect(card.overrideReasons.length).toBeGreaterThan(0);
  for (const reason of card.overrideReasons) {
    expect(reason.system).toBe(OVERRIDE_REASON_SYSTEM);
    expect(reason.code.length).toBeGreaterThan(0);
    expect(reason.display.length).toBeGreaterThan(0); // spec: MUST populate display
  }
}

beforeEach(() => {
  resetAllStations();
  resetFeedback();
});

describe("service endpoints follow the discovery document (CDS Hooks: {baseUrl}/cds-services/{service.id})", () => {
  it("every advertised service has hook, id, title and description", () => {
    for (const service of discoveryManifest().services) {
      expect(service.hook).toMatch(/^(patient-view|order-select)$/);
      expect(service.id.length).toBeGreaterThan(0);
      expect(service.title.length).toBeGreaterThan(0);
      expect(service.description.length).toBeGreaterThan(0);
    }
  });

  it("answers POST on the advertised patient-view service id (it used to 404 on it)", async () => {
    const res = await request(app).post(`/cds-services/${PATIENT_VIEW_SERVICE_ID}`).send(patientViewBody(TARGET.latitude, TARGET.longitude));
    expect(res.status).toBe(200);
    expect(res.body.cards).toEqual([]);
  });

  it("answers POST on the advertised order-select service id", async () => {
    const res = await request(app).post(`/cds-services/${ORDER_SELECT_SERVICE_ID}`).send(orderSelectBody());
    expect(res.status).toBe(200);
    expect(res.body.cards).toEqual([]);
  });

  it("still answers on the hook-name aliases", async () => {
    expect((await request(app).post("/cds-services/patient-view").send(patientViewBody(TARGET.latitude, TARGET.longitude))).status).toBe(200);
    expect((await request(app).post("/cds-services/order-select").send(orderSelectBody())).status).toBe(200);
  });
});

describe("every card the service can emit conforms to the CDS Hooks card spec", () => {
  async function patientCard() {
    const res = await request(app).post(`/cds-services/${PATIENT_VIEW_SERVICE_ID}`).send(patientViewBody(TARGET.latitude, TARGET.longitude));
    return res.body.cards[0] as AnyCard;
  }
  async function orderCard() {
    const res = await request(app).post(`/cds-services/${ORDER_SELECT_SERVICE_ID}`).send(orderSelectBody());
    return res.body.cards[0] as AnyCard;
  }

  it("patient-view, operator-confirmed (critical)", async () => {
    setStationState(TARGET.id, true, 0.9, new Date(), "operator");
    const card = await patientCard();
    expect(card.indicator).toBe("critical");
    expectConformingCard(card);
  });

  it("patient-view, inferred from a statistical signal (warning, unconfirmed)", async () => {
    setStationState(TARGET.id, true, 0.7, new Date(), "statistical-detection");
    const card = await patientCard();
    expect(card.indicator).toBe("warning");
    expectConformingCard(card);
  });

  it("patient-view, predicted downstream (warning)", async () => {
    setStationState(SOURCE.id, true, 0.9, new Date(), "operator");
    const card = await patientCard();
    expect(card.indicator).toBe("warning");
    expectConformingCard(card);
  });

  it("order-select, operator-confirmed (warning) with a subject on its ServiceRequest", async () => {
    setStationState(SOURCE.id, true, 0.9, new Date(), "operator");
    const card = await orderCard();
    expect(card.indicator).toBe("warning");
    expectConformingCard(card);
    expect(card.suggestions[0]!.actions[0]!.resource!.subject).toEqual({ reference: "Patient/demo-patient" });
  });

  it("order-select, inferred from a statistical signal: downgraded to info and labelled unconfirmed", async () => {
    setStationState(SOURCE.id, true, 0.7, new Date(), "statistical-detection");
    const card = await orderCard();
    expect(card.indicator).toBe("info");
    expect(card.summary).toContain("unconfirmed");
    expect(card.detail).toContain("NOT been confirmed");
    expectConformingCard(card);
  });
});

describe("feedback endpoint (CDS Hooks: POST {baseUrl}/cds-services/{service.id}/feedback)", () => {
  const url = `/cds-services/${PATIENT_VIEW_SERVICE_ID}/feedback`;
  const ts = "2026-09-21T10:15:30Z";
  const overridden = (extra: Record<string, unknown> = {}) => ({ card: "card-uuid-1", outcome: "overridden", outcomeTimestamp: ts, ...extra });

  it("records an override with a coded reason and counts it", async () => {
    const reason = { system: OVERRIDE_REASON_SYSTEM, code: "signal-doubted", display: "Signal unconfirmed or not trusted" };
    const res = await request(app).post(url).send({ feedback: [overridden({ overrideReason: { reason } })] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ recorded: 1 });
    expect(feedbackSummary()).toMatchObject({ total: 1, overridden: 1, overrideRate: 1, overrideReasons: { "signal-doubted": 1 } });
  });

  it("records an accepted suggestion, and reports the override rate across outcomes", async () => {
    await request(app).post(url).send({ feedback: [{ card: "c2", outcome: "accepted", acceptedSuggestions: [{ id: "s-1" }], outcomeTimestamp: ts }, overridden()] });
    expect(feedbackSummary()).toMatchObject({ total: 2, accepted: 1, overridden: 1, overrideRate: 0.5 });
    expect((await request(app).get("/monitoring/feedback")).body).toMatchObject({ total: 2, overrideRate: 0.5 });
  });

  it("works on the hook-name alias too, and 404s an unknown service", async () => {
    expect((await request(app).post("/cds-services/patient-view/feedback").send({ feedback: [overridden()] })).status).toBe(200);
    expect((await request(app).post("/cds-services/no-such-service/feedback").send({ feedback: [overridden()] })).status).toBe(404);
  });

  it("rejects malformed requests (400), each for its own reason", async () => {
    const bad: [string, unknown][] = [
      ["body is not an object with a feedback array", { nope: true }],
      ["empty feedback array", { feedback: [] }],
      ["missing card", { feedback: [{ outcome: "overridden", outcomeTimestamp: ts }] }],
      ["outcome not accepted/overridden", { feedback: [overridden({ outcome: "ignored" })] }],
      ["missing outcomeTimestamp", { feedback: [{ card: "c", outcome: "overridden" }] }],
      ["timestamp not in UTC (offset instead of Z)", { feedback: [overridden({ outcomeTimestamp: "2026-09-21T10:15:30+01:00" })] }],
      ["accepted without acceptedSuggestions", { feedback: [{ card: "c", outcome: "accepted", outcomeTimestamp: ts }] }],
      ["accepted suggestion without an id", { feedback: [{ card: "c", outcome: "accepted", acceptedSuggestions: [{}], outcomeTimestamp: ts }] }],
      ["override reason that is not a Coding", { feedback: [overridden({ overrideReason: { reason: "nope" } })] }],
    ];
    for (const [label, body] of bad) {
      const res = await request(app).post(url).send(body as object);
      expect(res.status, label).toBe(400);
    }
    expect(feedbackSummary().total).toBe(0);
  });

  it("is all-or-nothing: one invalid item means nothing is recorded, so a client can safely retry", async () => {
    const res = await request(app).post(url).send({ feedback: [overridden(), { card: "c" }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("feedback[1]");
    expect(feedbackSummary().total).toBe(0);
  });

  it("PRIVACY: counts a clinician's free-text comment but never stores it", async () => {
    const secret = "patient Maria Silva, NHS 123 456 7890, lives at Rua das Flores";
    await request(app).post(url).send({ feedback: [overridden({ overrideReason: { userComment: secret } })] });
    const stored = JSON.stringify(feedbackRecords());
    expect(stored).not.toContain("Maria");
    expect(stored).not.toContain("Flores");
    expect(feedbackRecords()[0]!.hadComment).toBe(true);
  });
});

describe("demo controls can be switched off (spoofing hazard outside a demo)", () => {
  const locked = createServer({ cdsAuth: undefined, demoRoutes: false });

  it("404s every /demo route, mutating or not", async () => {
    for (const [method, path] of [["get", "/demo/stations"], ["post", "/demo/simulate"], ["post", "/demo/reset"], ["post", "/demo/telemetry/inject"]] as const) {
      const res = await request(locked)[method](path).send({ stationId: SOURCE.id, flagged: true });
      expect(res.status, `${method} ${path}`).toBe(404);
    }
  });

  it("leaves the clinical surface untouched: discovery, hooks and feedback still work", async () => {
    expect((await request(locked).get("/cds-services")).status).toBe(200);
    expect((await request(locked).post(`/cds-services/${PATIENT_VIEW_SERVICE_ID}`).send(patientViewBody(TARGET.latitude, TARGET.longitude))).status).toBe(200);
    expect((await request(locked).get("/monitoring/feedback")).status).toBe(200);
  });

  it("no station can be flagged through a locked server", async () => {
    await request(locked).post("/demo/simulate").send({ stationId: TARGET.id, flagged: true, severityIndex: 0.9 });
    const res = await request(locked).post(`/cds-services/${PATIENT_VIEW_SERVICE_ID}`).send(patientViewBody(TARGET.latitude, TARGET.longitude));
    expect(res.body.cards).toEqual([]);
  });
});

describe("reproducibility: seeded telemetry", () => {
  async function ticks(seed: number | undefined, count: number) {
    resetAllTelemetry();
    const server = createServer({ cdsAuth: undefined, seed });
    const samples: number[] = [];
    for (let i = 0; i < count; i++) {
      const res = await request(server).post("/demo/telemetry/tick").send({});
      samples.push(...(res.body.stations as { latest: { sample: number } }[]).slice(0, 5).map((s) => s.latest.sample));
    }
    return samples;
  }

  it("the same seed reproduces the same telemetry exactly", async () => {
    expect(await ticks(123, 6)).toEqual(await ticks(123, 6));
  });

  it("a different seed gives different telemetry", async () => {
    expect(await ticks(123, 6)).not.toEqual(await ticks(124, 6));
  });
});

describe("PRIVACY: patient data is not logged", () => {
  const spies: ReturnType<typeof vi.spyOn>[] = [];
  afterEach(() => {
    for (const spy of spies.splice(0)) spy.mockRestore();
  });

  it("nothing identifying a patient reaches the console during a patient-view and a feedback call", async () => {
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      spies.push(vi.spyOn(console, method).mockImplementation(() => undefined));
    }
    setStationState(TARGET.id, true, 0.9, new Date(), "operator");
    const patientId = "PHI-PATIENT-7788";
    await request(app).post(`/cds-services/${PATIENT_VIEW_SERVICE_ID}`).send(patientViewBody(TARGET.latitude, TARGET.longitude, patientId));
    await request(app).post(`/cds-services/${PATIENT_VIEW_SERVICE_ID}/feedback`).send({
      feedback: [{ card: "c", outcome: "overridden", outcomeTimestamp: "2026-09-21T10:15:30Z", overrideReason: { userComment: `about ${patientId}` } }],
    });
    // also the malformed-JSON error path
    await request(app).post(`/cds-services/${PATIENT_VIEW_SERVICE_ID}`).set("content-type", "application/json").send(`{"patient":"${patientId}",`);

    const logged = spies.flatMap((s) => s.mock.calls.flat()).map(String).join("\n");
    expect(logged).not.toContain(patientId);
    expect(logged).not.toContain(String(TARGET.latitude));
  });
});
