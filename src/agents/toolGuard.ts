/**
 * Guards between a language model and the agent tools (SAFETY_CASE.md H14.8).
 *
 * The model may decide WHICH tools to call and, where it is safe, choose an
 * argument (e.g. the source station of a downstream forecast). It may not:
 *  - call a tool outside its agent's allowlist (drafting an advisory is
 *    never offered to a model);
 *  - leave the scope of the request (another catchment, a station of
 *    another river);
 *  - see or supply patient data -- location, symptoms and exposure history
 *    are bound server-side from the validated request, and the model is
 *    shown a declaration without those parameters;
 *  - pass a parameter the declaration does not have, or a wrong type.
 *
 * A call that fails any check is not executed; the model is told why and
 * the rejection is recorded in the trace.
 */

import { catchmentById } from "../data/catchments.js";
import type { PatientTriageInput } from "./clinicalTriageAgent.js";
import { ALL_AGENT_TOOLS, type AgentToolName } from "./tools.js";
import type { AgentToolDeclaration } from "./types.js";

export type BindResult = { ok: true; args: Record<string, unknown> } | { ok: false; reason: string };

export interface ToolGrant {
  name: AgentToolName;
  /** What the model is shown: the tool's declaration with server-bound
   * parameters removed. */
  declaration: AgentToolDeclaration;
  /** Check the model's arguments and return the arguments actually run. */
  bind(modelArgs: Record<string, unknown>): BindResult;
}

/** The tool's declaration restricted to `exposed` parameters. */
function exposedDeclaration(name: AgentToolName, exposed: string[]): AgentToolDeclaration {
  const full = ALL_AGENT_TOOLS[name].declaration;
  const properties = Object.fromEntries(Object.entries(full.parameters.properties).filter(([key]) => exposed.includes(key)));
  return {
    name: full.name,
    description: full.description,
    parameters: { type: "OBJECT", properties, required: full.parameters.required.filter((r) => exposed.includes(r)) },
  };
}

/** Structural check of the model's arguments against what it was shown. */
export function checkArgs(declaration: AgentToolDeclaration, args: Record<string, unknown>): string | null {
  const props = declaration.parameters.properties;
  for (const key of Object.keys(args)) {
    if (!(key in props)) return `parameter '${key}' is not accepted (it is set by the system or does not exist)`;
  }
  for (const key of declaration.parameters.required) {
    if (args[key] === undefined) return `parameter '${key}' is required`;
  }
  for (const [key, value] of Object.entries(args)) {
    const spec = props[key]!;
    const type = spec.type.toLowerCase();
    if (type === "string" && typeof value !== "string") return `parameter '${key}' must be a string`;
    if (type === "number" && (typeof value !== "number" || !Number.isFinite(value))) return `parameter '${key}' must be a number`;
    if (type === "boolean" && typeof value !== "boolean") return `parameter '${key}' must be a boolean`;
    if (spec.enum && !spec.enum.includes(String(value))) return `parameter '${key}' must be one of ${spec.enum.join(", ")}`;
  }
  return null;
}

function grant(name: AgentToolName, exposed: string[], bind: (args: Record<string, unknown>) => BindResult): ToolGrant {
  const declaration = exposedDeclaration(name, exposed);
  return {
    name,
    declaration,
    bind: (args) => {
      const problem = checkArgs(declaration, args);
      return problem ? { ok: false, reason: problem } : bind(args);
    },
  };
}

function inScope(catchmentId: string, modelCatchment: unknown): string | null {
  return modelCatchment === undefined || modelCatchment === catchmentId
    ? null
    : `this investigation is scoped to catchment '${catchmentId}'`;
}

/** Sentinel: telemetry (station optional, pinned if the request named one)
 * and the downstream forecast (source station chosen by the model, within
 * the catchment). */
export function sentinelGrants(catchmentId: string, pinnedStationId?: string): ToolGrant[] {
  const catchment = catchmentById(catchmentId)!;
  const isStation = (id: unknown) => typeof id === "string" && catchment.flowOrder.includes(id);
  return [
    grant("queryRiverTelemetry", ["catchmentId", "stationId"], (args) => {
      const scope = inScope(catchmentId, args.catchmentId);
      if (scope) return { ok: false, reason: scope };
      if (args.stationId !== undefined && !isStation(args.stationId)) {
        return { ok: false, reason: `station '${String(args.stationId)}' is not in catchment '${catchmentId}'` };
      }
      if (pinnedStationId !== undefined && args.stationId !== undefined && args.stationId !== pinnedStationId) {
        return { ok: false, reason: `this investigation is scoped to station '${pinnedStationId}'` };
      }
      const stationId = pinnedStationId ?? (args.stationId as string | undefined);
      return { ok: true, args: { catchmentId, ...(stationId ? { stationId } : {}) } };
    }),
    grant("runHydrologySimulation", ["catchmentId", "sourceStationId"], (args) => {
      const scope = inScope(catchmentId, args.catchmentId);
      if (scope) return { ok: false, reason: scope };
      if (!isStation(args.sourceStationId)) {
        return { ok: false, reason: `station '${String(args.sourceStationId)}' is not in catchment '${catchmentId}'` };
      }
      return { ok: true, args: { catchmentId, sourceStationId: args.sourceStationId } };
    }),
  ];
}

export function citizenGrants(catchmentId: string): ToolGrant[] {
  return [
    grant("evaluateCitizenCluster", ["catchmentId"], (args) => {
      const scope = inScope(catchmentId, args.catchmentId);
      return scope ? { ok: false, reason: scope } : { ok: true, args: { catchmentId } };
    }),
  ];
}

/** Clinical triage: the model can only choose to call the tools; every
 * patient value is bound from the validated request and never shown to it. */
export function clinicalGrants(patient: PatientTriageInput): ToolGrant[] {
  return [
    grant("queryPatientFHIRContext", [], () => ({ ok: true, args: patientProximityArgs(patient) })),
    grant("matchPathogenEpidemiology", [], () => ({ ok: true, args: patientEpidemiologyArgs(patient) })),
  ];
}

export function patientProximityArgs(patient: PatientTriageInput): Record<string, unknown> {
  return { latitude: patient.latitude, longitude: patient.longitude };
}

export function patientEpidemiologyArgs(patient: PatientTriageInput): Record<string, unknown> {
  return {
    symptomDescription: patient.symptoms,
    ...(patient.exposureHoursAgo !== undefined ? { incubationHours: patient.exposureHoursAgo } : {}),
    hasImmuneCompromise: patient.isImmunocompromised ?? false,
  };
}

/** Order-insensitive equality of two argument objects. */
export function sameArgs(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const norm = (o: Record<string, unknown>) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
  return norm(a) === norm(b);
}
