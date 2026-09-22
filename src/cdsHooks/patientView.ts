import { randomUUID } from "node:crypto";
import { ALL_STATIONS, catchmentOfStation } from "../data/catchments.js";
import { haversineKm, nearestStation, type StationPosition } from "../hydrology/propagation.js";
import { bandFactor, travelTimeBand } from "../hydrology/uncertainty.js";
import { engineFor } from "./catchmentEngines.js";
import type { ConfirmationSource } from "./exposureEngine.js";
import { overrideReasons } from "./feedback.js";
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
 * biological signature, so the card must not claim it did. A citizen
 * report that a water-authority operator has explicitly reviewed and
 * promoted (citizen/observations.ts) is as actionable as an operator's own
 * report -- a human made the confirmation call either way -- but its
 * wording stays honest about where the original observation came from
 * (a person's structured checklist submission, not an instrument). */
function describeFlag(confirmedVia: ConfirmationSource | undefined): string {
  if (confirmedVia === "statistical-detection") {
    return "was auto-escalated from a sustained statistical turbidity anomaly (an inferred early-warning signal, not a direct pathogen or biohazard measurement)";
  }
  if (confirmedVia === "citizen-reported") {
    return "was reported by a citizen observer (structured water/habitat checklist, AI-triaged) and reviewed and confirmed by the water authority";
  }
  return "currently shows an active biohazard signature";
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
    // Provenance of the flag driving this card: this station's own, or the
    // upstream source it traces back to.
    const via = evaluation.isOwnFlag
      ? evaluation.confirmedVia
      : engine.getStationState(evaluation.sourceStationId).confirmedVia;
    // SAFETY CONTROL (SAFETY_CASE.md H2): a flag inferred from a statistical
    // turbidity signal alone is NOT a confirmed exposure. It is presented at
    // 'warning' (not 'critical'), labelled unconfirmed, carries no
    // "do not delay empiric therapy" directive and no order-creating
    // suggestion -- acting on an unconfirmed alarm is exactly the
    // over-treatment antimicrobial stewardship exists to prevent, and the
    // detector's false-alarm rate (EVALUATION.md) is only as good as its
    // baseline assumptions.
    const inferred = via === "statistical-detection";
    // The proposed ServiceRequest must carry a subject (FHIR R4 ServiceRequest.subject
    // is 1..1 -- the official validator rejected the first version without one).
    // Taken from the hook context (required by CDS Hooks), falling back to the
    // prefetched Patient's id; with neither, no order is proposed at all rather
    // than an invalid one.
    const patientId = request.context?.patientId ?? (patient as { id?: string } | undefined)?.id;
    const lead = evaluation.isOwnFlag
      ? `${station.name} ${describeFlag(via)}`
      : `${station.name} is within the modeled downstream arrival window from ${source.name}` +
        (inferred ? `, whose flag ${describeFlag(via)}` : "");
    const closing = inferred
      ? `This has NOT been confirmed by water-authority sampling and is not a diagnosis; use clinical judgement on ` +
        `whether waterborne exposure is relevant, per ${protocol}.`
      : `Consider empiric waterborne-exposure workup per ${protocol}; ` +
        "do not delay empiric therapy awaiting confirmatory testing.";
    // CDS Hooks 2.0 detail MUST be GFM Markdown -- used here to separate the
    // primary, actionable clinical statement (what happened, what to do)
    // from the methodology caveat that follows it, rather than running both
    // into one undifferentiated paragraph. A real clinician was never
    // available to review this design (SAFETY_CASE.md is explicit about
    // that); this specific change follows the published "Five Rights of
    // Clinical Decision Support" framework's "right format" -- see
    // CLINICAL_REVIEW.md, which measured the previous single-paragraph
    // detail at ~1000 characters on the predicted-card path below.
    const card: Card = {
      uuid: randomUUID(),
      summary: inferred
        ? "Possible waterborne exposure window for this address (unconfirmed signal)"
        : "Active waterborne biohazard exposure window for this address",
      indicator: inferred ? "warning" : "critical",
      detail:
        `${lead} (elapsed ~${evaluation.elapsedMinutes.toFixed(0)} min). ${closing}\n\n` +
        `*Indicative WFD ecological status: ${evaluation.wfd.eqrClass} (EQR ${evaluation.wfd.indicativeEqr}). ${evaluation.wfd.note}*`,
      source: { label: `${sourceLabel} (deterministic exposure-window rule)` },
      suggestions:
        inferred || !patientId
          ? []
          : [
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
                      subject: { reference: `Patient/${patientId}` },
                    },
                  },
                ],
              },
            ],
      overrideReasons: overrideReasons(),
    };
    return { cards: [card] };
  }

  // phase === "predicted": a downstream forecast, not yet arrived.
  const forecast = evaluation.forecast!;
  const band = travelTimeBand(forecast.peakTimeMinutes);
  const sourceStation = catchment.stations.find((s) => s.id === evaluation.sourceStationId)!;
  // Same GFM-Markdown paragraph split as the confirmed-card path above: a
  // short, primary clinical statement first, the transport-model
  // methodology and its caveats (the bulk of the text -- this path
  // previously ran to ~1000 characters in one paragraph) set apart second.
  const primary =
    `${sourceStation.name} ${describeFlag(engine.getStationState(evaluation.sourceStationId).confirmedVia)}. The contamination front is predicted ` +
    `to reach ${station.name} in an estimated ${forecast.arrivalTimeMinutes.toFixed(0)}-${forecast.clearanceTimeMinutes.toFixed(0)} minutes ` +
    `(peak ~${forecast.peakTimeMinutes.toFixed(0)} min). No local confirmation yet -- this is a precautionary early-warning, not a confirmed exposure.`;
  const methodology =
    `*1D advection-dispersion transport model (Taylor-dispersion approximation; ${forecast.distanceKm.toFixed(2)} km straight-line at an assumed ` +
    `${catchment.meanVelocityMs} m/s mean velocity -- illustrative, not a calibrated gauge reading). If the assumed velocity is off by a factor of ` +
    `about ${bandFactor().toFixed(0)} either way the peak could fall anywhere from ${band.lowMinutes.toFixed(0)} to ${band.highMinutes.toFixed(0)} ` +
    `min -- a sensitivity range, not a calibrated interval. Modeled chance the front has ALREADY reached this station: ` +
    `${Math.round(evaluation.probability * 100)}% (this starts near 0% and rises as the window approaches -- it is not the chance the contamination ` +
    `reaches you at all). Indicative WFD ecological status if unmitigated: ${evaluation.wfd.eqrClass} (${evaluation.wfd.note})*`;
  const card: Card = {
    uuid: randomUUID(),
    summary: "Upstream waterborne contamination predicted to reach this address soon",
    indicator: "warning",
    detail: `${primary}\n\n${methodology}`,
    source: { label: `${sourceLabel} (downstream propagation forecast, deterministic)` },
    suggestions: [],
    overrideReasons: overrideReasons(),
  };
  return { cards: [card] };
}
