/**
 * Multi-station downstream contamination-propagation forecasting -- a
 * direct port of the sibling Python service's
 * `app/core/propagation_engine.py`, generalizing this module's earlier
 * fixed 2-point (single upstream/downstream pair) forecast to an
 * arbitrary N-station network walked in a declared flow order.
 */

import { computeTransportForecast, type TransportForecast } from "./advectionDispersion.js";

export interface StationPosition {
  stationId: string;
  latitude: number;
  longitude: number;
}

export interface PropagationForecast {
  sourceStationId: string;
  targetStationId: string;
  transport: TransportForecast;
}

const EARTH_RADIUS_KM = 6371.0088;

function haversineKm(a: StationPosition, b: StationPosition): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const lat1 = toRad(a.latitude);
  const lon1 = toRad(a.longitude);
  const lat2 = toRad(b.latitude);
  const lon2 = toRad(b.longitude);
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** The station_id whose position is closest (straight-line) to the given
 * point, or undefined if `positions` is empty. */
export function nearestStation(
  positions: Map<string, StationPosition>,
  latitude: number,
  longitude: number,
): string | undefined {
  if (positions.size === 0) return undefined;
  const query: StationPosition = { stationId: "__query__", latitude, longitude };
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const [stationId, position] of positions) {
    const distance = haversineKm(query, position);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = stationId;
    }
  }
  return best;
}

/**
 * For every flagged station, walk downstream through `flowOrder`
 * accumulating distance, computing a transport forecast to each
 * downstream station that isn't itself already flagged. If more than one
 * upstream station could reach the same downstream target, the soonest
 * (minimum peak-time) forecast wins.
 */
export function computeNetworkForecasts(
  flowOrder: string[],
  positions: Map<string, StationPosition>,
  flaggedStationIds: Set<string>,
  meanVelocityMs: number,
  dispersionCoefficientM2S?: number,
): PropagationForecast[] {
  const bestByTarget = new Map<string, PropagationForecast>();

  for (let startIndex = 0; startIndex < flowOrder.length; startIndex++) {
    const sourceId = flowOrder[startIndex]!;
    if (!flaggedStationIds.has(sourceId) || !positions.has(sourceId)) continue;

    let cumulativeKm = 0;
    let previous = positions.get(sourceId)!;
    for (let i = startIndex + 1; i < flowOrder.length; i++) {
      const targetId = flowOrder[i]!;
      const current = positions.get(targetId);
      if (!current) break;
      cumulativeKm += haversineKm(previous, current);
      previous = current;
      if (flaggedStationIds.has(targetId)) continue; // already confirmed downstream

      const transport = computeTransportForecast({
        distanceKm: cumulativeKm,
        meanVelocityMs,
        ...(dispersionCoefficientM2S !== undefined ? { dispersionCoefficientM2S } : {}),
      });
      const existing = bestByTarget.get(targetId);
      if (!existing || transport.peakTimeMinutes < existing.transport.peakTimeMinutes) {
        bestByTarget.set(targetId, { sourceStationId: sourceId, targetStationId: targetId, transport });
      }
    }
  }

  return Array.from(bestByTarget.values()).sort((a, b) => a.transport.peakTimeMinutes - b.transport.peakTimeMinutes);
}

export { haversineKm };
