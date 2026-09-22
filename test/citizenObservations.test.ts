import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../src/cdsHooks/server.js";
import { resetAllStations, setStationState } from "../src/cdsHooks/exposureEngine.js";
import { resetAllObservations } from "../src/citizen/observations.js";
import { MONDEGO_STATIONS } from "../src/data/mondegoNetwork.js";

const app = createServer({ cdsAuth: undefined });
const STATION = MONDEGO_STATIONS[2]!; // Parque Verde do Mondego

const clearInput = { clarityScore: 5, unusualOdor: false, deadWildlife: false, discoloration: false, foam: false };
const concerningInput = { clarityScore: 1, unusualOdor: true, deadWildlife: true, discoloration: false, foam: false };

beforeEach(() => {
  resetAllStations();
  resetAllObservations();
});

function patientViewBody(latitude: number, longitude: number) {
  return {
    hookInstance: "t1",
    hook: "patient-view",
    context: { userId: "Practitioner/demo-md", patientId: "demo-patient" },
    prefetch: {
      patient: {
        resourceType: "Patient",
        id: "demo-patient",
        address: [{ extension: [{ url: "http://hl7.org/fhir/StructureDefinition/geolocation", extension: [{ url: "latitude", valueDecimal: latitude }, { url: "longitude", valueDecimal: longitude }] }] }],
      },
    },
  };
}

describe("POST /citizen/observations", () => {
  it("400s an unknown station id", async () => {
    const res = await request(app).post("/citizen/observations").send({ stationId: "NOT-A-STATION", input: clearInput });
    expect(res.status).toBe(400);
  });

  it("400s a malformed input payload (missing fields, wrong types, out-of-range score)", async () => {
    for (const bad of [{}, { clarityScore: 6 }, { ...clearInput, clarityScore: 0 }, { ...clearInput, unusualOdor: "yes" }]) {
      const res = await request(app).post("/citizen/observations").send({ stationId: STATION.id, input: bad });
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
  });

  it("400s a note that is too long", async () => {
    const res = await request(app)
      .post("/citizen/observations")
      .send({ stationId: STATION.id, input: clearInput, note: "x".repeat(501) });
    expect(res.status).toBe(400);
  });

  it("201s a valid submission and returns the full triage assessment", async () => {
    const res = await request(app).post("/citizen/observations").send({ stationId: STATION.id, input: concerningInput, note: "saw a few dead fish near the bank" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("pending");
    expect(res.body.stationId).toBe(STATION.id);
    expect(res.body.triage.recommendReview).toBe(true);
    expect(res.body.triage.explanation.contributions.length).toBeGreaterThan(0);
    expect(res.body.note).toContain("dead fish");
  });

  it("a clear report is NOT recommended for review", async () => {
    const res = await request(app).post("/citizen/observations").send({ stationId: STATION.id, input: clearInput });
    expect(res.body.triage.recommendReview).toBe(false);
  });
});

describe("SAFETY: submitting an observation, however concerning, never by itself confirms an exposure", () => {
  it("no station is flagged after a highly concerning submission (no promotion yet)", async () => {
    await request(app).post("/citizen/observations").send({ stationId: STATION.id, input: concerningInput });
    const state = await request(app).get("/demo/state");
    // A station that has never had setStationState() called on it doesn't
    // appear in the states list at all -- absent is itself proof nothing
    // was set, which is exactly the guarantee being tested here.
    const flagged = state.body.stations.find((s: { stationId: string }) => s.stationId === STATION.id);
    expect(flagged?.flagged ?? false).toBe(false);
  });

  it("no CDS Hooks card fires for a patient at that station before promotion", async () => {
    await request(app).post("/citizen/observations").send({ stationId: STATION.id, input: concerningInput });
    const res = await request(app).post("/cds-services/patient-view").send(patientViewBody(STATION.latitude, STATION.longitude));
    expect(res.body.cards).toEqual([]);
  });

  it("this holds even for MANY concerning submissions at the same station", async () => {
    for (let i = 0; i < 10; i++) {
      await request(app).post("/citizen/observations").send({ stationId: STATION.id, input: concerningInput });
    }
    const state = await request(app).get("/demo/state");
    const flagged = state.body.stations.find((s: { stationId: string }) => s.stationId === STATION.id);
    expect(flagged?.flagged ?? false).toBe(false);
  });
});

describe("GET /citizen/observations", () => {
  it("lists newest first, and filters by stationId", async () => {
    const other = MONDEGO_STATIONS[0]!;
    await request(app).post("/citizen/observations").send({ stationId: other.id, input: clearInput });
    await request(app).post("/citizen/observations").send({ stationId: STATION.id, input: concerningInput });

    const all = await request(app).get("/citizen/observations");
    expect(all.body.observations).toHaveLength(2);
    expect(all.body.observations[0].stationId).toBe(STATION.id); // newest first

    const filtered = await request(app).get(`/citizen/observations?stationId=${STATION.id}`);
    expect(filtered.body.observations).toHaveLength(1);
  });

  it("GET /citizen/observations/:id 404s an unknown id", async () => {
    const res = await request(app).get("/citizen/observations/not-a-real-id");
    expect(res.status).toBe(404);
  });
});

describe("promote: the human-review step, and the only path to a real flag", () => {
  it("promoting creates a real flag, tagged confirmedVia: citizen-reported", async () => {
    const submit = await request(app).post("/citizen/observations").send({ stationId: STATION.id, input: concerningInput });
    const promote = await request(app).post(`/citizen/observations/${submit.body.id}/promote`).send({});
    expect(promote.status).toBe(200);
    expect(promote.body.status).toBe("promoted");

    const state = await request(app).get("/demo/state");
    const flagged = state.body.stations.find((s: { stationId: string }) => s.stationId === STATION.id);
    expect(flagged.flagged).toBe(true);
    expect(flagged.confirmedVia).toBe("citizen-reported");
  });

  it("after promotion, the CDS card fires, discloses the citizen origin honestly, and is full-strength (not downgraded like a statistical inference)", async () => {
    const submit = await request(app).post("/citizen/observations").send({ stationId: STATION.id, input: concerningInput });
    await request(app).post(`/citizen/observations/${submit.body.id}/promote`).send({});

    const res = await request(app).post("/cds-services/patient-view").send(patientViewBody(STATION.latitude, STATION.longitude));
    expect(res.body.cards).toHaveLength(1);
    const card = res.body.cards[0];
    expect(card.indicator).toBe("critical");
    expect(card.detail).toContain("reported by a citizen observer");
    expect(card.detail).toContain("reviewed and confirmed by the water authority");
    expect(card.detail).toContain("do not delay empiric therapy");
    expect(card.suggestions).toHaveLength(1); // the order-suggestion UI, same as any other confirmed card
  });

  it("400s promoting an already-promoted or dismissed observation (no double-promotion)", async () => {
    const submit = await request(app).post("/citizen/observations").send({ stationId: STATION.id, input: concerningInput });
    await request(app).post(`/citizen/observations/${submit.body.id}/promote`).send({});
    const again = await request(app).post(`/citizen/observations/${submit.body.id}/promote`).send({});
    expect(again.status).toBe(400);
  });

  it("400s promoting an unknown observation id", async () => {
    const res = await request(app).post("/citizen/observations/not-a-real-id/promote").send({});
    expect(res.status).toBe(400);
  });

  it("an explicit severityIndex overrides the triage-derived default", async () => {
    const submit = await request(app).post("/citizen/observations").send({ stationId: STATION.id, input: concerningInput });
    await request(app).post(`/citizen/observations/${submit.body.id}/promote`).send({ severityIndex: 0.42 });
    const state = await request(app).get("/demo/state");
    const flagged = state.body.stations.find((s: { stationId: string }) => s.stationId === STATION.id);
    expect(flagged.severityIndex).toBeCloseTo(0.42, 5);
  });

  it("does not clobber a pre-existing operator confirmation's provenance if promoted afterward at a different station is unaffected", async () => {
    const otherStation = MONDEGO_STATIONS[0]!;
    setStationState(otherStation.id, true, 0.9, new Date(), "operator");
    const submit = await request(app).post("/citizen/observations").send({ stationId: STATION.id, input: concerningInput });
    await request(app).post(`/citizen/observations/${submit.body.id}/promote`).send({});

    const state = await request(app).get("/demo/state");
    const other = state.body.stations.find((s: { stationId: string }) => s.stationId === otherStation.id);
    expect(other.confirmedVia).toBe("operator"); // untouched
  });
});

describe("dismiss: the human reviewer says no, and that must also never touch the exposure engine", () => {
  it("dismissing marks the record dismissed and never flags the station", async () => {
    const submit = await request(app).post("/citizen/observations").send({ stationId: STATION.id, input: concerningInput });
    const dismiss = await request(app).post(`/citizen/observations/${submit.body.id}/dismiss`).send();
    expect(dismiss.status).toBe(200);
    expect(dismiss.body.status).toBe("dismissed");

    const state = await request(app).get("/demo/state");
    const flagged = state.body.stations.find((s: { stationId: string }) => s.stationId === STATION.id);
    expect(flagged?.flagged ?? false).toBe(false);
  });

  it("400s dismissing an already-reviewed observation", async () => {
    const submit = await request(app).post("/citizen/observations").send({ stationId: STATION.id, input: concerningInput });
    await request(app).post(`/citizen/observations/${submit.body.id}/dismiss`).send();
    const again = await request(app).post(`/citizen/observations/${submit.body.id}/dismiss`).send();
    expect(again.status).toBe(400);
  });
});

describe("works regardless of /demo routes being disabled (this is not a demo control)", () => {
  it("submission and promotion both work on a server with demoRoutes: false", async () => {
    const locked = createServer({ cdsAuth: undefined, demoRoutes: false });
    const submit = await request(locked).post("/citizen/observations").send({ stationId: STATION.id, input: concerningInput });
    expect(submit.status).toBe(201);
    const promote = await request(locked).post(`/citizen/observations/${submit.body.id}/promote`).send({});
    expect(promote.status).toBe(200);
  });
});
