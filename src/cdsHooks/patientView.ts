import { randomUUID } from "node:crypto";
import { ALL_STATIONS, catchmentOfStation } from "../data/catchments.js";
import { haversineKm, nearestStation, type StationPosition } from "../hydrology/propagation.js";
import { engineFor } from "./catchmentEngines.js";
import type { ConfirmationSource } from "./exposureEngine.js";
import { extractPatientAddress } from "./geolocation.js";
import type { Card, CdsHookResponse, PatientViewRequest } from "./types.js";

/** How close a patient's geocoded address must be to its nearest station
 * to be considered "in a monitored network" at all. Illustrative -- a real
 * deployment would use a proper catchment polygon, not a fixed radius
 * around each point. Without this, `nearestStation` would happily return
 * "closest of all stations" even for a patient hundreds of km from any
 * river we monitor. */
const NEAR_STATION_RADIUS_KM = 2.0;

const LOINC_SYSTEM = "http://loinc.org";
/** LOINC 82195-9 "Gastrointestinal pathogens DNA and RNA panel - Stool by
 * NAA with non-probe detection" -- verified against loinc.org (see
 * README.md "Verified codes"). */
const GI_PATHOGEN_PCR_PANEL = { system: LOINC_SYSTEM, code: "82195-9" };

/** How a flagged station's flag is described to a clinician. An operator's
 * report is direct ground truth; a statistical auto-escalation is inferred
 * from a turbidity trend alone -- it never observed a pathogen or a
 * biological signature, so the card must not claim it did. */
function describeFlag(confirmedVia: ConfirmationSource | undefined): string {
  return confirmedVia === "statistical-detection"
    ? "was auto-escalated from a sustained statistical turbidity anomaly (an inferred early-warning signal, not a direct pathogen or biohazard measurement)"
    : "currently shows an active biohazard signature";
}

function allStationPositions(): Map<string, StationPosition> {
  const positions = new Map<string, StationPosition>();
  for (const station of ALL_STATIONS) {
    positions.set(station.id, { stationId: station.id, latitude: station.latitude, longitude: station.longitude });
  }
  return positions;
}

export function handlePatientView(request: PatientViewRequest): CdsHookResponse {
  const patient = (request.prefetch as { patient?: unknown } | undefined)?.patient;
  const address = extractPatientAddress(patient);
  if (!address) return { cards: [] };

  const positions = allStationPositions();
  const stationId = nearestStation(positions, address.latitude, address.longitude);
  if (!stationId) return { cards: [] };
  const catchment = catchmentOfStation(stationId)!;
  const station = catchment.stations.find((s) => s.id === stationId)!;
  const distanceKm = haversineKm(
    { stationId: "__patient__", latitude: address.latitude, longitude: address.longitude },
    positions.get(stationId)!,
  );
  if (distanceKm > NEAR_STATION_RADIUS_KM) return { cards: [] };

  const engine = engineFor(catchment.id);
  const evaluation = engine.evaluateStationExposure(stationId);
  if (!evaluation || evaluation.phase === "cleared") return { cards: [] };

  // A hospital is named only where one was independently verified (Coimbra's
  // CHUC); everywhere else the card says "your institution's protocol"
  // rather than inventing a hospital.
  const protocol = catchment.hospitalAnchor
    ? `${catchment.hospitalAnchor} institutional protocol`
    : "your institution's protocol";
  const sourceLabel = `OAH-${catchment.label}`;

  if (evaluation.isOwnFlag || evaluation.phase === "confirmed") {
    const source = catchment.stations.find((s) => s.id === evaluation.sourceStationId)!;
    const card: Card = {
      uuid: randomUUID(),
      summary: "Active waterborne biohazard exposure window for this address",
      indicator: "critical",
      detail:
        `${station.name} ${evaluation.isOwnFlag ? describeFlag(evaluation.confirmedVia) : "is within the modeled downstream arrival window from " + source.name} ` +
        `(elapsed ~${evaluation.elapsedMinutes.toFixed(0)} min). Indicative WFD ecological status: ${evaluation.wfd.eqrClass} ` +
        `(EQR ${evaluation.wfd.indicativeEqr}). Consider empiric waterborne-exposure workup per ${protocol}; ` +
        "do not delay empiric therapy awaiting confirmatory testing.",
      source: { label: `${sourceLabel} (deterministic exposure-window rule)` },
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
  const sourceStation = catchment.stations.find((s) => s.id === evaluation.sourceStationId)!;
  const card: Card = {
    uuid: randomUUID(),
    summary: "Upstream waterborne contamination predicted to reach this address soon",
    indicator: "warning",
    detail:
      `${sourceStation.name} ${describeFlag(engine.getStationState(evaluation.sourceStationId).confirmedVia)}. A 1D advection-dispersion transport ` +
      `model (Taylor-dispersion approximation; ${forecast.distanceKm.toFixed(2)} km straight-line at an assumed ${catchment.meanVelocityMs} m/s mean ` +
      `velocity -- illustrative, not a calibrated gauge reading) predicts the contamination front will reach ` +
      `${station.name} in an estimated ${forecast.arrivalTimeMinutes.toFixed(0)}-${forecast.clearanceTimeMinutes.toFixed(0)} ` +
      `minutes (peak ~${forecast.peakTimeMinutes.toFixed(0)} min); modeled chance the front has ALREADY reached this ` +
      `station: ${Math.round(evaluation.probability * 100)}% (this starts near 0% and rises as the window approaches -- ` +
      `it is not the chance the contamination reaches you at all). Indicative WFD ecological status if unmitigated: ${evaluation.wfd.eqrClass} ` +
      `(${evaluation.wfd.note}). No local confirmation yet -- this is a precautionary early-warning, not a confirmed ` +
      "exposure.",
    source: { label: `${sourceLabel} (downstream propagation forecast, deterministic)` },
    suggestions: [],
  };
  return { cards: [card] };
}
