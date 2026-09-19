import { randomUUID } from "node:crypto";
import { CHUC_ANCHOR, MONDEGO_STATIONS, stationById } from "../data/mondegoNetwork.js";
import { haversineKm, nearestStation, type StationPosition } from "../hydrology/propagation.js";
import { evaluateStationExposure } from "./exposureEngine.js";
import { extractPatientAddress } from "./geolocation.js";
import type { Card, CdsHookResponse, PatientViewRequest } from "./types.js";

/** How close a patient's geocoded address must be to its nearest station
 * to be considered "in this monitored network" at all. Illustrative -- a
 * real deployment would use a proper catchment polygon (as the sibling
 * Python service's shapely-based CatchmentIndex does), not a fixed radius
 * around each point. Without this, `nearestStation` would happily return
 * "closest of the 6" even for a patient hundreds of km away in Lisbon. */
const NEAR_STATION_RADIUS_KM = 2.0;

const LOINC_SYSTEM = "http://loinc.org";
/** LOINC 82195-9 "Gastrointestinal pathogens DNA and RNA panel - Stool by
 * NAA with non-probe detection" -- verified against loinc.org (see
 * README.md "Verified codes"). */
const GI_PATHOGEN_PCR_PANEL = { system: LOINC_SYSTEM, code: "82195-9" };

function networkPositions(): Map<string, StationPosition> {
  const positions = new Map<string, StationPosition>();
  for (const station of MONDEGO_STATIONS) {
    positions.set(station.id, { stationId: station.id, latitude: station.latitude, longitude: station.longitude });
  }
  return positions;
}

export function handlePatientView(request: PatientViewRequest): CdsHookResponse {
  const patient = (request.prefetch as { patient?: unknown } | undefined)?.patient;
  const address = extractPatientAddress(patient);
  if (!address) return { cards: [] };

  const positions = networkPositions();
  const stationId = nearestStation(positions, address.latitude, address.longitude);
  if (!stationId) return { cards: [] };
  const station = stationById(stationId)!;
  const distanceKm = haversineKm(
    { stationId: "__patient__", latitude: address.latitude, longitude: address.longitude },
    positions.get(stationId)!,
  );
  if (distanceKm > NEAR_STATION_RADIUS_KM) return { cards: [] };

  const evaluation = evaluateStationExposure(stationId);
  if (!evaluation || evaluation.phase === "cleared") return { cards: [] };

  if (evaluation.isOwnFlag || evaluation.phase === "confirmed") {
    const card: Card = {
      uuid: randomUUID(),
      summary: "Active waterborne biohazard exposure window for this address",
      indicator: "critical",
      detail:
        `${station.name} ${evaluation.isOwnFlag ? "currently shows an active biohazard signature" : "is within the modeled downstream arrival window from " + stationById(evaluation.sourceStationId)!.name} ` +
        `(elapsed ~${evaluation.elapsedMinutes.toFixed(0)} min). Indicative WFD ecological status: ${evaluation.wfd.eqrClass} ` +
        `(EQR ${evaluation.wfd.indicativeEqr}). Consider empiric waterborne-exposure workup per ${CHUC_ANCHOR} ` +
        "institutional protocol; do not delay empiric therapy awaiting confirmatory testing.",
      source: { label: "OAH-Mondego (deterministic exposure-window rule)" },
      suggestions: [
        {
          label: "Gastrointestinal pathogens DNA/RNA panel (stool NAA) -- LOINC 82195-9",
          uuid: randomUUID(),
          actions: [
            {
              type: "create",
              description:
                "Order a stool-based multiplex GI pathogen NAA panel to identify the causative organism and " +
                "support antimicrobial de-escalation once results return (antimicrobial stewardship).",
              resource: {
                resourceType: "ServiceRequest",
                status: "draft",
                intent: "order",
                code: { coding: [GI_PATHOGEN_PCR_PANEL] },
              },
            },
          ],
        },
      ],
    };
    return { cards: [card] };
  }

  // phase === "predicted": a downstream forecast, not yet arrived.
  const forecast = evaluation.forecast!;
  const sourceStation = stationById(evaluation.sourceStationId)!;
  const card: Card = {
    uuid: randomUUID(),
    summary: "Upstream waterborne contamination predicted to reach this address soon",
    indicator: "warning",
    detail:
      `${sourceStation.name} currently shows an active biohazard signature. A 1D advection-dispersion transport ` +
      `model (Taylor-dispersion approximation; ${forecast.distanceKm.toFixed(2)} km at an assumed 0.36 m/s mean ` +
      `velocity -- illustrative, not a calibrated gauge reading) predicts the contamination front will reach ` +
      `${station.name} in an estimated ${forecast.arrivalTimeMinutes.toFixed(0)}-${forecast.clearanceTimeMinutes.toFixed(0)} ` +
      `minutes (peak ~${forecast.peakTimeMinutes.toFixed(0)} min), estimated probability ` +
      `${Math.round(evaluation.probability * 100)}%. Indicative WFD ecological status if unmitigated: ${evaluation.wfd.eqrClass} ` +
      `(${evaluation.wfd.note}). No local confirmation yet -- this is a precautionary early-warning, not a confirmed ` +
      "exposure.",
    source: { label: "OAH-Mondego (downstream propagation forecast, deterministic)" },
    suggestions: [],
  };
  return { cards: [card] };
}
