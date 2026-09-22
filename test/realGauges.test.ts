import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "../src/cdsHooks/server.js";
import { getRealGaugeReading, resetRealGaugeCache } from "../src/cdsHooks/realGauge.js";
import { ALL_STATIONS } from "../src/data/catchments.js";
import { REAL_GAUGE_MATCHES, realGaugeForStation } from "../src/data/realGauges.js";
import { haversineKm } from "../src/cdsHooks/geolocation.js";

const originalFetch = global.fetch;
function mockFetchOnce(impl: (url: string) => Promise<Response> | Response) {
  global.fetch = vi.fn((url: string | URL) => Promise.resolve(impl(String(url)))) as unknown as typeof fetch;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  resetRealGaugeCache();
});
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("REAL_GAUGE_MATCHES: every claimed match is a real, nearby place", () => {
  it("every matched stationId exists in the actual station registry", () => {
    const ids = new Set(ALL_STATIONS.map((s) => s.id));
    for (const m of REAL_GAUGE_MATCHES) {
      expect(ids.has(m.stationId), `${m.stationId} is not a real station id`).toBe(true);
    }
  });

  it("every match's independently-fetched gauge coordinates sit within 3 km of our own station coordinates (same reach)", () => {
    for (const m of REAL_GAUGE_MATCHES) {
      const station = ALL_STATIONS.find((s) => s.id === m.stationId)!;
      const distanceKm = haversineKm(station.latitude, station.longitude, m.gaugeLatitude, m.gaugeLongitude);
      expect(distanceKm, `${m.stationId} vs PEGELONLINE ${m.gaugeName}`).toBeLessThan(3);
    }
  });

  it("no duplicate station ids or gauge UUIDs", () => {
    const stationIds = REAL_GAUGE_MATCHES.map((m) => m.stationId);
    const uuids = REAL_GAUGE_MATCHES.map((m) => m.pegelonlineUuid);
    expect(new Set(stationIds).size).toBe(stationIds.length);
    expect(new Set(uuids).size).toBe(uuids.length);
  });

  it("Cologne (DE-COLOGNE) deliberately has no match -- not approximated to a different station", () => {
    expect(realGaugeForStation("DE-COLOGNE")).toBeUndefined();
  });
});

describe("getRealGaugeReading", () => {
  it("returns no-match for a station with no gauge (no network call made)", async () => {
    mockFetchOnce(() => {
      throw new Error("should not be called");
    });
    const result = await getRealGaugeReading("DE-COLOGNE");
    expect(result).toEqual({ ok: false, reason: "no-match" });
  });

  it("returns no-match for a non-German / unknown station", async () => {
    const result = await getRealGaugeReading("PT-SANTA-CLARA");
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toBe("no-match");
  });

  it("parses a successful response into a typed reading, tagged with source and licence", async () => {
    mockFetchOnce(() => jsonResponse({ timestamp: "2026-09-22T05:45:00+02:00", value: 62.0, stateMnwMhw: "low" }));
    const result = await getRealGaugeReading("DE-DRESDEN");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.reading).toMatchObject({
      stationId: "DE-DRESDEN",
      gaugeName: "DRESDEN",
      waterLevelCm: 62.0,
      stateMnwMhw: "low",
      measuredAt: "2026-09-22T05:45:00+02:00",
      source: expect.stringContaining("PEGELONLINE"),
      licence: "DL-DE->Zero-2.0",
    });
    expect(new Date(result.reading.fetchedAt).toISOString()).toBe(result.reading.fetchedAt);
  });

  it("degrades to a handled failure (never throws) on an HTTP error", async () => {
    mockFetchOnce(() => jsonResponse({ error: "not found" }, 404));
    const result = await getRealGaugeReading("DE-MAINZ");
    expect(result).toMatchObject({ ok: false, reason: "fetch-failed", detail: "HTTP 404" });
  });

  it("degrades to a handled failure on a network error (never throws)", async () => {
    mockFetchOnce(() => {
      throw new TypeError("network unreachable");
    });
    const result = await getRealGaugeReading("DE-MAINZ");
    expect(result).toMatchObject({ ok: false, reason: "fetch-failed" });
  });

  it("degrades to a handled failure on a malformed response shape", async () => {
    mockFetchOnce(() => jsonResponse({ nonsense: true }));
    const result = await getRealGaugeReading("DE-MAINZ");
    expect(result).toMatchObject({ ok: false, reason: "fetch-failed", detail: "unexpected response shape" });
  });

  it("caches a successful reading: a second call within the TTL makes no second network request", async () => {
    let calls = 0;
    mockFetchOnce(() => {
      calls += 1;
      return jsonResponse({ timestamp: "2026-09-22T05:45:00+02:00", value: 62.0, stateMnwMhw: "low" });
    });
    await getRealGaugeReading("DE-DRESDEN");
    await getRealGaugeReading("DE-DRESDEN");
    expect(calls).toBe(1);
  });

  it("serves a stale cached reading rather than nothing when a later fetch fails", async () => {
    mockFetchOnce(() => jsonResponse({ timestamp: "2026-09-22T05:45:00+02:00", value: 62.0, stateMnwMhw: "low" }));
    const first = await getRealGaugeReading("DE-DRESDEN");
    expect(first.ok).toBe(true);

    // Force the cache to be considered expired, then make the network fail.
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 10 * 60_000);
    mockFetchOnce(() => {
      throw new Error("down");
    });
    const second = await getRealGaugeReading("DE-DRESDEN");
    expect(second.ok).toBe(true); // stale-but-present beats nothing
    if (second.ok) expect(second.reading.waterLevelCm).toBe(62.0);
  });
});

describe("GET /real-gauge/:stationId (route, never breaks the app)", () => {
  const app = createServer({ cdsAuth: undefined });

  it("200s with available:true for a matched station on a healthy fetch", async () => {
    mockFetchOnce(() => jsonResponse({ timestamp: "2026-09-22T05:45:00+02:00", value: 62.0, stateMnwMhw: "low" }));
    const res = await request(app).get("/real-gauge/DE-DRESDEN");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ available: true, stationId: "DE-DRESDEN", waterLevelCm: 62 });
  });

  it("200s with available:false (not a 500) for an unmatched station", async () => {
    const res = await request(app).get("/real-gauge/DE-COLOGNE");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: false, reason: "no-match" });
  });

  it("200s with available:false (not a 500) when the upstream network fails", async () => {
    mockFetchOnce(() => {
      throw new Error("simulated outage");
    });
    const res = await request(app).get("/real-gauge/DE-MAINZ");
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(false);
    expect(res.body.reason).toBe("fetch-failed");
  });

  it("is not under /demo -- disabling demo routes does not disable it", async () => {
    mockFetchOnce(() => jsonResponse({ timestamp: "2026-09-22T05:45:00+02:00", value: 10, stateMnwMhw: "normal" }));
    const locked = createServer({ cdsAuth: undefined, demoRoutes: false });
    const res = await request(locked).get("/real-gauge/DE-DRESDEN");
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
  });
});
