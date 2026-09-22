import { describe, expect, it } from "vitest";
import { computeTransportForecast } from "../src/hydrology/advectionDispersion.js";
import { classifyWfdEcologicalStatus } from "../src/hydrology/wfdClassification.js";
import { collectionBundle, nameBasedUuid } from "../src/fhir/bundle.js";
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

  // Mirrors a finding of the official HL7 validator (dom-6: a resource should have narrative).
  it("carries a generated XHTML narrative that states it is preliminary and not a diagnosis", () => {
    const { text } = buildForecastRiskAssessment(buildInput());
    expect(text?.status).toBe("generated");
    expect(text?.div.startsWith('<div xmlns="http://www.w3.org/1999/xhtml">')).toBe(true);
    expect(text?.div.endsWith("</div>")).toBe(true);
    expect(text?.div).toContain("Preliminary model output");
    expect(text?.div).toContain("Not a diagnosis");
    expect(text?.div).toContain("65%");
  });

  it("escapes markup characters in the narrative so it stays well-formed XHTML", () => {
    const hostile = { ...target, name: `Rio <b>"A&B"</b>` };
    const { text } = buildForecastRiskAssessment(buildInput({ target: hostile }));
    expect(text?.div).not.toContain("<b>");
    expect(text?.div).toContain("Rio &lt;b&gt;&quot;A&amp;B&quot;&lt;/b&gt;");
  });
});

describe("collectionBundle (FHIR R4 collection Bundle)", () => {
  const resources = [
    buildForecastRiskAssessment(buildInput()),
    buildForecastRiskAssessment(buildInput({ target: MONDEGO_STATIONS[3]! })),
  ];

  // Mirrors the validator's "Bundle entry missing fullUrl" errors (20 of them on the first version).
  it("gives every entry a urn:uuid fullUrl", () => {
    const bundle = collectionBundle(resources);
    expect(bundle.resourceType).toBe("Bundle");
    expect(bundle.type).toBe("collection");
    for (const entry of bundle.entry) {
      expect(entry.fullUrl).toMatch(/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });

  it("is deterministic per resource and distinct across resources", () => {
    const a = collectionBundle(resources).entry.map((e) => e.fullUrl);
    const b = collectionBundle(resources).entry.map((e) => e.fullUrl);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(resources.length);
  });

  it("nameBasedUuid reproduces independent RFC 4122 v5 known answers (Python's uuid.uuid5)", () => {
    expect(nameBasedUuid("python.org", "6ba7b8109dad11d180b400c04fd430c8")).toBe("886313e1-3b8a-5372-9b90-0c9aee199e5d");
    expect(nameBasedUuid("RiskAssessment/x")).toBe("71d07d2b-9e0a-5720-a02a-4c59e3509d2d");
  });
});
