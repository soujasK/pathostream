/**
 * Validation for the /api/agents/* request bodies. Nothing is defaulted: a
 * missing catchment or symptom list is a 400, not a silent "mondego" or
 * "watery diarrhea" that would produce a confident answer to a question
 * nobody asked (SAFETY_CASE.md H14).
 */

import { catchmentById } from "../data/catchments.js";
import type { PatientTriageInput } from "./clinicalTriageAgent.js";

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

const MAX_PATIENT_ID_LENGTH = 128;
const MAX_SYMPTOMS_LENGTH = 2000;
/** 30 days: the longest incubation window any rule in matchPathogenEpidemiology uses is 14. */
const MAX_EXPOSURE_HOURS = 720;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function validateCatchmentAndStation(body: unknown): Validated<{ catchmentId: string; stationId?: string }> {
  if (!isObject(body)) return { ok: false, error: "body must be a JSON object" };
  if (typeof body.catchmentId !== "string" || body.catchmentId.length === 0) {
    return { ok: false, error: "catchmentId is required" };
  }
  const catchment = catchmentById(body.catchmentId);
  if (!catchment) return { ok: false, error: `Unknown catchmentId '${body.catchmentId}'` };
  if (body.stationId === undefined) return { ok: true, value: { catchmentId: catchment.id } };
  if (typeof body.stationId !== "string" || !catchment.stations.some((s) => s.id === body.stationId)) {
    return { ok: false, error: `stationId is not a station of catchment '${catchment.id}'` };
  }
  return { ok: true, value: { catchmentId: catchment.id, stationId: body.stationId } };
}

export function validatePatientContext(body: unknown): Validated<PatientTriageInput> {
  if (!isObject(body)) return { ok: false, error: "patient context must be a JSON object" };
  const { patientId, latitude, longitude, symptoms, exposureHoursAgo, isImmunocompromised } = body;

  if (typeof patientId !== "string" || patientId.trim().length === 0 || patientId.length > MAX_PATIENT_ID_LENGTH) {
    return { ok: false, error: `patientId must be a non-empty string of at most ${MAX_PATIENT_ID_LENGTH} characters` };
  }
  if (!isFiniteNumber(latitude) || latitude < -90 || latitude > 90) {
    return { ok: false, error: "latitude must be a number between -90 and 90" };
  }
  if (!isFiniteNumber(longitude) || longitude < -180 || longitude > 180) {
    return { ok: false, error: "longitude must be a number between -180 and 180" };
  }
  if (typeof symptoms !== "string" || symptoms.trim().length === 0 || symptoms.length > MAX_SYMPTOMS_LENGTH) {
    return { ok: false, error: `symptoms must be a non-empty string of at most ${MAX_SYMPTOMS_LENGTH} characters` };
  }
  if (exposureHoursAgo !== undefined && (!isFiniteNumber(exposureHoursAgo) || exposureHoursAgo < 0 || exposureHoursAgo > MAX_EXPOSURE_HOURS)) {
    return { ok: false, error: `exposureHoursAgo must be a number between 0 and ${MAX_EXPOSURE_HOURS}` };
  }
  if (isImmunocompromised !== undefined && typeof isImmunocompromised !== "boolean") {
    return { ok: false, error: "isImmunocompromised must be a boolean" };
  }

  return {
    ok: true,
    value: {
      patientId,
      latitude,
      longitude,
      symptoms: symptoms.trim(),
      ...(exposureHoursAgo !== undefined ? { exposureHoursAgo } : {}),
      ...(isImmunocompromised !== undefined ? { isImmunocompromised } : {}),
    },
  };
}
