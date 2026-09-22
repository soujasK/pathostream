/**
 * Writes the FHIR resources the service emits to conformance/samples/ so
 * they can be checked with the official HL7 validator (see
 * conformance/README.md). In-process: no server needs to be running.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import request from "supertest";
import { resetAllStations, setStationState } from "../src/cdsHooks/exposureEngine.js";
import { createServer } from "../src/cdsHooks/server.js";
import { MONDEGO_STATIONS } from "../src/data/mondegoNetwork.js";

const OUT = "conformance/samples";
mkdirSync(OUT, { recursive: true });
const app = createServer();
const source = MONDEGO_STATIONS[0]!;
const target = MONDEGO_STATIONS[2]!;

// 1. Forecast Bundle: five downstream RiskAssessments from one flagged source.
resetAllStations();
await request(app).post("/demo/simulate").send({ stationId: source.id, flagged: true, severityIndex: 0.9 });
const bundle = (await request(app).get("/demo/forecast-bundle")).body;
writeFileSync(`${OUT}/forecast-bundle.json`, JSON.stringify(bundle, null, 2) + "\n");

// 2. The ServiceRequest an operator-confirmed (full-strength) card proposes.
resetAllStations();
setStationState(target.id, true, 0.9, new Date(), "operator");
const hook = {
  hookInstance: "11111111-1111-4111-8111-111111111111",
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
                { url: "latitude", valueDecimal: target.latitude },
                { url: "longitude", valueDecimal: target.longitude },
              ],
            },
          ],
        },
      ],
    },
  },
};
const card = (await request(app).post("/cds-services/patient-view").send(hook)).body.cards[0];
writeFileSync(`${OUT}/service-request.json`, JSON.stringify(card.suggestions[0].actions[0].resource, null, 2) + "\n");
resetAllStations();
console.log(`wrote ${bundle.entry.length} RiskAssessments and 1 ServiceRequest to ${OUT}/`);
