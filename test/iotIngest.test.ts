import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { MIN_PHASE_ONE_READINGS } from "../src/analytics/baseline.js";
import { ESCALATION_THRESHOLD_TICKS } from "../src/analytics/detectorConfig.js";
import { parseDeviceRegistry } from "../src/iot/deviceAuth.js";
import { deviceState, ingestReading, knownDeviceIds, resetAllDevices } from "../src/iot/ingest.js";
import { createServer } from "../src/cdsHooks/server.js";
import { resetAllStations, setStationState } from "../src/cdsHooks/exposureEngine.js";
import { ALL_STATIONS } from "../src/data/catchments.js";
import { gaussianNoise, mulberry32 } from "../src/evaluation/prng.js";

beforeEach(() => {
  resetAllDevices();
});

// A seeded, independent Gaussian source for Phase-I fixtures below. Plain
// Math.random() jitter would work in expectation but is NOT safe here: the
// baseline gate's autocorrelation check has a real, documented ~5%
// false-reject rate on genuinely independent data (see EVALUATION.md's
// gate table, n=200/phi=0), so an unseeded random fixture is flaky by
// construction, about 1 run in 20 -- seeding removes that.
function phaseOneNoise(seed: number) {
  const noise = gaussianNoise(mulberry32(seed));
  return () => noise.next();
}

describe("parseDeviceRegistry", () => {
  it("parses one or more deviceId:key pairs", () => {
    const r = parseDeviceRegistry("dev-1:secret1,dev-2:secret2");
    expect(r.isConfigured).toBe(true);
    expect(r.deviceIds().sort()).toEqual(["dev-1", "dev-2"]);
    expect(r.verify("dev-1", "secret1")).toBe(true);
    expect(r.verify("dev-1", "wrong")).toBe(false);
    expect(r.verify("dev-2", "secret1")).toBe(false); // not cross-valid
    expect(r.verify("unknown", "secret1")).toBe(false);
  });

  it("is unconfigured when unset or empty", () => {
    expect(parseDeviceRegistry(undefined).isConfigured).toBe(false);
    expect(parseDeviceRegistry("").isConfigured).toBe(false);
    expect(parseDeviceRegistry("  ").isConfigured).toBe(false);
  });

  it("rejects malformed entries and duplicate device ids", () => {
    expect(() => parseDeviceRegistry("no-colon-here")).toThrow(/malformed/);
    expect(() => parseDeviceRegistry("dev-1:")).toThrow(/malformed/);
    expect(() => parseDeviceRegistry(":secret")).toThrow(/malformed/);
    expect(() => parseDeviceRegistry("dev-1:a,dev-1:b")).toThrow(/duplicate/);
  });

  it("tolerates ':' inside a key (only the first colon separates id from key)", () => {
    const r = parseDeviceRegistry("dev-1:part:with:colons");
    expect(r.verify("dev-1", "part:with:colons")).toBe(true);
  });
});

describe("ingestReading: requires a real baseline before it will detect anything", () => {
  it("rejects a bad payload before touching any state", () => {
    expect(ingestReading("d1", { measuredAt: "not-a-date", ntu: 15 })).toMatchObject({ ok: false });
    expect(ingestReading("d1", { measuredAt: new Date().toISOString(), ntu: -1 })).toMatchObject({ ok: false });
    expect(ingestReading("d1", { measuredAt: new Date().toISOString(), ntu: Number.NaN })).toMatchObject({ ok: false });
  });

  it("accumulates Phase-I readings and refuses to monitor until the baseline gate passes", () => {
    for (let i = 0; i < MIN_PHASE_ONE_READINGS - 1; i++) {
      const result = ingestReading("d2", { measuredAt: new Date().toISOString(), ntu: 15 });
      expect(result.ok, `reading ${i}`).toBe(false);
    }
    const summary = deviceState("d2")!;
    expect(summary.monitoring).toBe(false);
    expect(summary.baseline?.n).toBe(MIN_PHASE_ONE_READINGS - 1);
  });

  it("starts monitoring once the gate passes, using THIS device's own mean/sd (not the demo's fixed constant)", () => {
    // A device with a different baseline (mean ~40, small independent noise) from the demo's 15+-3.
    const noise = phaseOneNoise(1);
    for (let i = 0; i < MIN_PHASE_ONE_READINGS; i++) {
      ingestReading("d3", { measuredAt: new Date().toISOString(), ntu: 40 + noise() });
    }
    const summary = deviceState("d3")!;
    expect(summary.monitoring).toBe(true);
    expect(summary.baseline!.mean).toBeCloseTo(40, 0);
    // A reading at the demo's baseline (15) is a massive deviation from THIS device's 40 baseline.
    const result = ingestReading("d3", { measuredAt: new Date().toISOString(), ntu: 15 });
    expect(result).toMatchObject({ ok: true, latest: { outOfControl: true } });
  });

  it("rejects a baseline that fails the autocorrelation check (a real hazard the demo telemetry never exercises)", () => {
    // Alternating high/low is strongly (negatively) autocorrelated.
    for (let i = 0; i < MIN_PHASE_ONE_READINGS; i++) {
      const result = ingestReading("d4", { measuredAt: new Date().toISOString(), ntu: i % 2 === 0 ? 5 : 25 });
      if (i === MIN_PHASE_ONE_READINGS - 1) {
        expect(result.ok).toBe(false);
        expect((result as { error: string }).error).toContain("autocorrelation");
      }
    }
  });

  it("escalates after ESCALATION_THRESHOLD_TICKS consecutive out-of-control readings, same rule as the demo", () => {
    const noise = phaseOneNoise(2);
    for (let i = 0; i < MIN_PHASE_ONE_READINGS; i++) ingestReading("d5", { measuredAt: new Date().toISOString(), ntu: 15 + noise() });
    let escalatedAt = -1;
    for (let i = 1; i <= 10; i++) {
      const result = ingestReading("d5", { measuredAt: new Date().toISOString(), ntu: 15 + 45 }); // a large sustained shift
      if (result.ok && result.autoEscalated && escalatedAt === -1) escalatedAt = i;
    }
    expect(escalatedAt).toBe(ESCALATION_THRESHOLD_TICKS);
  });

  it("records battery/signal telemetry when provided, without requiring it", () => {
    const noise = phaseOneNoise(3);
    for (let i = 0; i < MIN_PHASE_ONE_READINGS; i++) ingestReading("d6", { measuredAt: new Date().toISOString(), ntu: 15 + noise() });
    const result = ingestReading("d6", { measuredAt: new Date().toISOString(), ntu: 15, batteryVolts: 3.6, rssiDbm: -82 });
    expect(result.ok).toBe(true);
  });

  it("deviceState is null for a device that has never sent a reading", () => {
    expect(deviceState("never-seen")).toBeNull();
  });

  it("knownDeviceIds lists only devices that have actually ingested something (even mid-Phase-I, before a baseline is accepted)", () => {
    ingestReading("d7", { measuredAt: new Date().toISOString(), ntu: 15 });
    expect(knownDeviceIds()).toContain("d7");
    expect(knownDeviceIds()).not.toContain("never-seen-either");
  });
});

describe("ISOLATION: the IoT pipeline never touches the demo's synthetic stations", () => {
  beforeEach(() => resetAllStations());

  it("ingesting under a station's own id does not flag that station in the exposure engine", async () => {
    const anyStation = ALL_STATIONS[0]!;
    const noise = phaseOneNoise(4);
    for (let i = 0; i < MIN_PHASE_ONE_READINGS + 10; i++) {
      ingestReading(anyStation.id, { measuredAt: new Date().toISOString(), ntu: 15 + noise() + (i > MIN_PHASE_ONE_READINGS ? 45 : 0) });
    }
    const summary = deviceState(anyStation.id)!;
    expect(summary.autoEscalated).toBe(true); // the IoT pipeline itself did escalate...
    // ...but the real per-river exposure engine (what actually drives a
    // CDS Hooks card) was never touched by any of this.
    setStationState;
    const app = createServer({ cdsAuth: undefined, iotDevices: parseDeviceRegistry(undefined) });
    const res = await request(app).get("/demo/state");
    const own = (res.body.evaluations as { stationId: string }[]).find((e) => e.stationId === anyStation.id);
    expect(own).toBeUndefined();
  });
});

describe("HTTP: POST /iot/devices/:deviceId/telemetry", () => {
  const REGISTRY = parseDeviceRegistry("sensor-A:top-secret-key,sensor-B:another-key");

  function appWith(registry = REGISTRY) {
    return createServer({ cdsAuth: undefined, iotDevices: registry });
  }

  it("503s every write when no device keys are configured (never silently open)", async () => {
    const app = appWith(parseDeviceRegistry(undefined));
    const res = await request(app)
      .post("/iot/devices/sensor-A/telemetry")
      .send({ measuredAt: new Date().toISOString(), ntu: 15 });
    expect(res.status).toBe(503);
  });

  it("401s with no Authorization header, and with a wrong key", async () => {
    const app = appWith();
    const noAuth = await request(app).post("/iot/devices/sensor-A/telemetry").send({ measuredAt: new Date().toISOString(), ntu: 15 });
    expect(noAuth.status).toBe(401);
    expect(noAuth.headers["www-authenticate"]).toBeDefined();

    const wrongKey = await request(app)
      .post("/iot/devices/sensor-A/telemetry")
      .set("Authorization", "Bearer wrong-key")
      .send({ measuredAt: new Date().toISOString(), ntu: 15 });
    expect(wrongKey.status).toBe(401);
  });

  it("401s a key that is valid for a DIFFERENT device (no cross-device auth)", async () => {
    const app = appWith();
    const res = await request(app)
      .post("/iot/devices/sensor-A/telemetry")
      .set("Authorization", "Bearer another-key") // sensor-B's key
      .send({ measuredAt: new Date().toISOString(), ntu: 15 });
    expect(res.status).toBe(401);
  });

  it("400s a malformed body even with valid auth", async () => {
    const app = appWith();
    const res = await request(app)
      .post("/iot/devices/sensor-A/telemetry")
      .set("Authorization", "Bearer top-secret-key")
      .send({ ntu: "not-a-number" });
    expect(res.status).toBe(400);
  });

  it("201s a valid reading with valid auth, then 422s while the baseline gate is still unmet", async () => {
    const app = appWith();
    const res = await request(app)
      .post("/iot/devices/sensor-A/telemetry")
      .set("Authorization", "Bearer top-secret-key")
      .send({ measuredAt: new Date().toISOString(), ntu: 15 });
    expect(res.status).toBe(422); // gate not yet met (n=1)
    expect(res.body.error).toContain("readings");
  });

  it("full flow over HTTP: enough readings pass the gate, then start monitoring, then GET the device's state", async () => {
    const app = appWith();
    let last = { status: 0 };
    const noise = phaseOneNoise(5);
    for (let i = 0; i < MIN_PHASE_ONE_READINGS; i++) {
      last = await request(app)
        .post("/iot/devices/sensor-A/telemetry")
        .set("Authorization", "Bearer top-secret-key")
        .send({ measuredAt: new Date().toISOString(), ntu: 15 + noise() });
    }
    expect(last.status).toBe(201);

    const stateRes = await request(app).get("/iot/devices/sensor-A/state");
    expect(stateRes.status).toBe(200);
    expect(stateRes.body.monitoring).toBe(true);
    expect(stateRes.body.deviceId).toBe("sensor-A");
  });

  it("404s the state of a device that has never sent anything", async () => {
    const app = appWith();
    const res = await request(app).get("/iot/devices/never-sent-anything/state");
    expect(res.status).toBe(404);
  });

  it("GET /iot/devices reports configured vs active device ids separately", async () => {
    const app = appWith();
    await request(app)
      .post("/iot/devices/sensor-A/telemetry")
      .set("Authorization", "Bearer top-secret-key")
      .send({ measuredAt: new Date().toISOString(), ntu: 15 });
    const res = await request(app).get("/iot/devices");
    expect(res.body.configured).toBe(true);
    expect(res.body.configuredDeviceIds.sort()).toEqual(["sensor-A", "sensor-B"]);
    expect(res.body.activeDeviceIds).toEqual(["sensor-A"]);
  });

  it("works even when /demo routes are disabled (a different concern entirely)", async () => {
    const app = createServer({ cdsAuth: undefined, demoRoutes: false, iotDevices: REGISTRY });
    const res = await request(app)
      .post("/iot/devices/sensor-A/telemetry")
      .set("Authorization", "Bearer top-secret-key")
      .send({ measuredAt: new Date().toISOString(), ntu: 15 });
    expect(res.status).toBe(422); // reached real ingestion logic, not a 404
  });
});
