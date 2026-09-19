import { describe, expect, it } from "vitest";
import { computeTransportForecast } from "../src/hydrology/advectionDispersion.js";
import { classifyWfdEcologicalStatus } from "../src/hydrology/wfdClassification.js";
import { buildForecastRiskAssessment } from "../src/fhir/riskAssessment.js";
import { MONDEGO_STATIONS } from "../src/data/mondegoNetwork.js";

const source = MONDEGO_STATIONS[0]!; // Ponte de Santa Clara
const target = MONDEGO_STATIONS[2]!; // Parque Verde do Mondego
const meanVelocityMs = 0.36;
const forecast = computeTransportForecast({ distanceKm: 2.0, meanVelocityMs });
const wfd = classifyWfdEcologicalStatus(0.7);

function buildInput(overrides: Partial<Parameters<typeof buildForecastRiskAssessment>[0]> = {}) {
  return { source, target, forecast, wfd, meanVelocityMs, probability: 0.65, ...overrides };
}

describe("buildForecastRiskAssessment", () => {
  it("produces a resource matching the FHIR R4 RiskAssessment shape", () => {
    const resource = buildForecastRiskAssessment(buildInput());

    expect(resource.resourceType).toBe("RiskAssessment");
    expect(resource.status).toBe("preliminary");
    expect(resource.subject.reference).toBe(`Location/${target.id}`);
    expect(resource.basis?.[0]?.reference).toBe(`Location/${source.id}`);
    expect(resource.prediction).toHaveLength(1);

    const prediction = resource.prediction[0]!;
    expect(prediction.outcome.coding[0]?.system).toBe("http://snomed.info/sct");
    expect(prediction.outcome.coding[0]?.code).toBe("77377001"); // Leptospirosis, verified
    expect(prediction.probabilityDecimal).toBeGreaterThanOrEqual(0);
    expect(prediction.probabilityDecimal).toBeLessThanOrEqual(1);
    expect(prediction.whenPeriod?.start).toBeDefined();
    expect(prediction.whenPeriod?.end).toBeDefined();
    // ISO 8601 round-trip check -- these must be real, parseable instants.
    expect(new Date(prediction.whenPeriod!.start).toISOString()).toBe(prediction.whenPeriod!.start);
    expect(new Date(prediction.whenPeriod!.end).toISOString()).toBe(prediction.whenPeriod!.end);
  });

  it("whenPeriod.start precedes whenPeriod.end", () => {
    const resource = buildForecastRiskAssessment(buildInput());
    const prediction = resource.prediction[0]!;
    const start = new Date(prediction.whenPeriod!.start).getTime();
    const end = new Date(prediction.whenPeriod!.end).getTime();
    expect(start).toBeLessThan(end);
  });

  it("rounds probabilityDecimal to two decimal places", () => {
    const resource = buildForecastRiskAssessment(buildInput({ probability: 0.123456 }));
    expect(resource.prediction[0]!.probabilityDecimal).toBe(0.12);
  });

  it("maps probability to the correct qualitative-risk code", () => {
    const high = buildForecastRiskAssessment(buildInput({ probability: 0.9 }));
    const moderate = buildForecastRiskAssessment(buildInput({ probability: 0.5 }));
    const low = buildForecastRiskAssessment(buildInput({ probability: 0.1 }));

    expect(high.prediction[0]!.qualitativeRisk?.coding[0]?.code).toBe("high");
    expect(moderate.prediction[0]!.qualitativeRisk?.coding[0]?.code).toBe("moderate");
    expect(low.prediction[0]!.qualitativeRisk?.coding[0]?.code).toBe("low");
  });

  it("is valid JSON (round-trips through JSON.stringify/parse unchanged)", () => {
    const resource = buildForecastRiskAssessment(buildInput());
    const roundTripped = JSON.parse(JSON.stringify(resource));
    expect(roundTripped).toEqual(resource);
  });
});
