/**
 * Citizen-submitted water/habitat observations: storage, AI triage, and
 * the human-review workflow that is the ONLY path from a citizen report to
 * a real, clinically-visible confirmed exposure.
 *
 * The causal chain is deliberately asymmetric with the other two sources
 * (SAFETY_CASE.md hazard H2 already establishes this pattern for
 * statistical detection; this extends it): the AI classifier
 * (classifier.ts) never calls into the exposure engine itself. A
 * submission always lands as a 'pending' record; only an explicit
 * `promoteObservation` call -- the demo's stand-in for a real
 * water-authority reviewer's decision -- creates a real flag, tagged
 * `confirmedVia: 'citizen-reported'` so the clinician's card stays honest
 * about its origin (patientView.ts's describeFlag()).
 */

import { randomUUID } from "node:crypto";
import { catchmentOfStation, stationAnywhere } from "../data/catchments.js";
import { engineFor } from "../cdsHooks/catchmentEngines.js";
import { assessObservation, type TriageResult } from "./classifier.js";
import { isValidObservationInput, type ObservationInput } from "./features.js";

const MAX_NOTE_LENGTH = 500;
const MAX_OBSERVATIONS = 2000; // bounded in-memory store, same pattern as feedback.ts

export type ObservationStatus = "pending" | "promoted" | "dismissed";

export interface CitizenObservation {
  id: string;
  stationId: string;
  catchmentId: string;
  submittedAt: string;
  input: ObservationInput;
  note: string | null;
  triage: TriageResult;
  status: ObservationStatus;
  reviewedAt: string | null;
}

const observations = new Map<string, CitizenObservation>();
const order: string[] = []; // insertion order, for bounding + newest-first listing

export type SubmitResult = { ok: true; observation: CitizenObservation } | { ok: false; error: string };

export function submitObservation(stationId: string, input: unknown, note: unknown): SubmitResult {
  const station = stationAnywhere(stationId);
  if (!station) return { ok: false, error: `Unknown stationId '${stationId}'` };
  if (!isValidObservationInput(input)) {
    return { ok: false, error: "body.input must include clarityScore (1-5 integer) and the four boolean flags" };
  }
  if (note !== undefined && note !== null && typeof note !== "string") {
    return { ok: false, error: "note must be a string if provided" };
  }
  if (typeof note === "string" && note.length > MAX_NOTE_LENGTH) {
    return { ok: false, error: `note must be at most ${MAX_NOTE_LENGTH} characters` };
  }

  const catchment = catchmentOfStation(stationId)!;
  const observation: CitizenObservation = {
    id: randomUUID(),
    stationId,
    catchmentId: catchment.id,
    submittedAt: new Date().toISOString(),
    input,
    note: typeof note === "string" && note.length > 0 ? note : null,
    triage: assessObservation(input),
    status: "pending",
    reviewedAt: null,
  };

  observations.set(observation.id, observation);
  order.push(observation.id);
  if (order.length > MAX_OBSERVATIONS) {
    const oldest = order.shift();
    if (oldest) observations.delete(oldest);
  }

  return { ok: true, observation };
}

export function listObservations(stationId?: string): CitizenObservation[] {
  const all = [...order].reverse().map((id) => observations.get(id)!);
  return stationId ? all.filter((o) => o.stationId === stationId) : all;
}

export function getObservation(id: string): CitizenObservation | undefined {
  return observations.get(id);
}

export type ReviewResult = { ok: true; observation: CitizenObservation } | { ok: false; error: string };

/** The human-in-the-loop step. `severityIndex` lets a reviewer weigh in
 * on severity same as the operator "Confirm" control does; if omitted,
 * derived from the triage probability so a report the model flagged as
 * more concerning starts with proportionally higher severity -- still
 * just a starting point a reviewer could override in a real tool, not
 * claimed as calibrated. */
export function promoteObservation(id: string, severityIndex?: number): ReviewResult {
  const observation = observations.get(id);
  if (!observation) return { ok: false, error: `Unknown observation id '${id}'` };
  if (observation.status !== "pending") {
    return { ok: false, error: `observation is already '${observation.status}', not pending` };
  }

  const engine = engineFor(observation.catchmentId);
  const severity = severityIndex ?? Math.min(0.95, Math.max(0.5, observation.triage.probability));
  engine.setStationState(observation.stationId, true, severity, new Date(), "citizen-reported");

  observation.status = "promoted";
  observation.reviewedAt = new Date().toISOString();
  return { ok: true, observation };
}

export function dismissObservation(id: string): ReviewResult {
  const observation = observations.get(id);
  if (!observation) return { ok: false, error: `Unknown observation id '${id}'` };
  if (observation.status !== "pending") {
    return { ok: false, error: `observation is already '${observation.status}', not pending` };
  }
  observation.status = "dismissed";
  observation.reviewedAt = new Date().toISOString();
  return { ok: true, observation };
}

export function resetAllObservations(): void {
  observations.clear();
  order.length = 0;
}
