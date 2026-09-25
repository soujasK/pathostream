import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../src/cdsHooks/server.js";
import { resetAllObservations, submitObservation } from "../src/citizen/observations.js";
import { MONDEGO_STATIONS } from "../src/data/mondegoNetwork.js";
import {
  OAH_INDICATOR_SYSTEM,
  OAH_LOCATION_PROFILE,
  OAH_OBSERVATION_PROFILE,
  buildCitizenOahObservation,
  buildOahLocation,
  citizenObservationBundle,
  locationFullUrl,
} from "../src/fhir/oahObservation.js";

const STATION = MONDEGO_STATIONS[2]!;
const concerning = { clarityScore: 1, unusualOdor: true, deadWildlife: true, discoloration: false, foam: true };

function submit() {
  const r = submitObservation(STATION.id, concerning, "smells of sewage");
  if (!r.ok) throw new Error(r.error);
  return r.observation;
}

beforeEach(() => resetAllObservations());

describe("citizen report as an OneAquaHealth IG Observation", () => {
  it("meets the observation-indicators-oah profile's rules (status, code, subject, effective, performer, component values)", () => {
    const obs = buildCitizenOahObservation(submit(), STATION);
    expect(obs.meta.profile).toEqual([OAH_OBSERVATION_PROFILE]);
    expect(obs.status).toBe("final");
    expect(obs.code.coding?.[0]).toMatchObject({ system: OAH_INDICATOR_SYSTEM, code: "foam" });
    expect(obs.subject.reference).toBe(locationFullUrl(STATION.id));
    expect(obs.effectiveDateTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(obs.performer.length).toBeGreaterThanOrEqual(1);
    for (const c of obs.component) {
      const values = [c.valueCodeableConcept, c.valueQuantity].filter(Boolean);
      expect(values, c.code.text).toHaveLength(1);
    }
  });

  it("never claims the macrophytes profile, and codes only what the IG's indicator actually means", () => {
    const obs = buildCitizenOahObservation(submit(), STATION);
    expect(JSON.stringify(obs)).not.toContain("observation-with-component-oah");
    const text = (c: (typeof obs.component)[number]) => c.code.text ?? "";
    const dead = obs.component.find((c) => text(c).startsWith("Dead fish"))!;
    const clarity = obs.component.find((c) => text(c).startsWith("Water clarity"))!;
    expect(dead.code.coding).toBeUndefined();
    expect(clarity.code.coding).toBeUndefined();
    expect(clarity.valueQuantity).toEqual({ value: 1, unit: "rating (1-5)" });
  });

  it("reports the human-review status and that AI triage is only a recommendation, and keeps the free-text note out", () => {
    const obs = buildCitizenOahObservation(submit(), STATION);
    expect(obs.note[0]!.text).toContain("Review status: pending");
    expect(obs.note[0]!.text).toContain("not a confirmation");
    expect(JSON.stringify(obs)).not.toContain("smells of sewage");
  });

  it("builds a location-oah Location with identifier, name, mode=instance and full position", () => {
    const loc = buildOahLocation(STATION);
    expect(loc.meta.profile).toEqual([OAH_LOCATION_PROFILE]);
    expect(loc.identifier.length).toBeGreaterThanOrEqual(1);
    expect(loc.name).toBe(STATION.name);
    expect(loc.mode).toBe("instance");
    expect(loc.position).toEqual({ longitude: STATION.longitude, latitude: STATION.latitude });
  });

  it("bundles the Location and the report so the subject reference resolves inside the Bundle", () => {
    const bundle = citizenObservationBundle(submit(), STATION);
    const [loc, obs] = bundle.entry;
    expect(bundle.type).toBe("collection");
    expect((obs!.resource as { subject: { reference: string } }).subject.reference).toBe(loc!.fullUrl);
  });

  it("GET /citizen/observations/:id/fhir serves the Bundle as FHIR JSON, and 404s an unknown id", async () => {
    const app = createServer({ cdsAuth: undefined, demoRoutes: true });
    const id = submit().id;
    const res = await request(app).get(`/citizen/observations/${id}/fhir`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/fhir+json");
    expect(JSON.parse(res.text).entry).toHaveLength(2);
    expect((await request(app).get("/citizen/observations/nope/fhir")).status).toBe(404);
  });
});
