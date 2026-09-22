/**
 * Fetches a live reading from PEGELONLINE (see data/realGauges.ts for what
 * this is and, more importantly, what it is NOT). Network calls to a
 * government API a test suite doesn't control need: a timeout (the API
 * has none documented), a small cache (repeated requests within a demo
 * session shouldn't hammer someone else's server), and a result type that
 * makes "the network failed" a normal, handled case rather than a crash --
 * this is supplementary context, and its absence must never break the
 * page that shows it.
 */

import { realGaugeForStation, type RealGaugeMatch } from "../data/realGauges.js";

const PEGELONLINE_BASE = "https://www.pegelonline.wsv.de/webservices/rest-api/v2";
const FETCH_TIMEOUT_MS = 4_000;
const CACHE_TTL_MS = 5 * 60_000;

export interface RealGaugeReading {
  stationId: string;
  gaugeName: string;
  waterLevelCm: number;
  /** PEGELONLINE's own qualitative state, e.g. "low"/"normal"/"high"
   * relative to that gauge's recorded mean low/high water -- passed
   * through as-is, not reinterpreted. */
  stateMnwMhw: string | null;
  measuredAt: string;
  fetchedAt: string;
  source: string;
  licence: string;
}

export type RealGaugeResult =
  | { ok: true; reading: RealGaugeReading }
  | { ok: false; reason: "no-match" }
  | { ok: false; reason: "fetch-failed"; detail: string };

interface CacheEntry {
  reading: RealGaugeReading;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

interface RawMeasurement {
  timestamp?: unknown;
  value?: unknown;
  stateMnwMhw?: unknown;
}

function isRawMeasurement(value: unknown): value is RawMeasurement {
  return typeof value === "object" && value !== null;
}

async function fetchLive(match: RealGaugeMatch): Promise<RealGaugeResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const url = `${PEGELONLINE_BASE}/stations/${match.pegelonlineUuid}/W/currentmeasurement.json`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      return { ok: false, reason: "fetch-failed", detail: `HTTP ${response.status}` };
    }
    const body: unknown = await response.json();
    if (!isRawMeasurement(body) || typeof body.timestamp !== "string" || typeof body.value !== "number") {
      return { ok: false, reason: "fetch-failed", detail: "unexpected response shape" };
    }
    const reading: RealGaugeReading = {
      stationId: match.stationId,
      gaugeName: match.gaugeName,
      waterLevelCm: body.value,
      stateMnwMhw: typeof body.stateMnwMhw === "string" ? body.stateMnwMhw : null,
      measuredAt: body.timestamp,
      fetchedAt: new Date().toISOString(),
      source: "PEGELONLINE (Wasserstraßen- und Schifffahrtsverwaltung des Bundes)",
      licence: "DL-DE->Zero-2.0",
    };
    cache.set(match.stationId, { reading, expiresAt: Date.now() + CACHE_TTL_MS });
    return { ok: true, reading };
  } catch (error) {
    return { ok: false, reason: "fetch-failed", detail: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

/** Serves a cached reading if it's still fresh; otherwise fetches live and
 * caches the result. On a network failure, serves a stale cached reading
 * (clearly timestamped as such by the caller reading `fetchedAt`) rather
 * than nothing, if one exists. */
export async function getRealGaugeReading(stationId: string): Promise<RealGaugeResult> {
  const match = realGaugeForStation(stationId);
  if (!match) return { ok: false, reason: "no-match" };

  const cached = cache.get(stationId);
  if (cached && cached.expiresAt > Date.now()) return { ok: true, reading: cached.reading };

  const result = await fetchLive(match);
  if (result.ok) return result;
  if (cached) return { ok: true, reading: cached.reading }; // serve stale over nothing
  return result;
}

/** Test-only: clears the cache between test cases. */
export function resetRealGaugeCache(): void {
  cache.clear();
}
