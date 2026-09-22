import { randomUUID } from "node:crypto";
import { MONDEGO_STATIONS } from "../data/mondegoNetwork.js";
import { evaluateStationExposure, getStationState } from "./exposureEngine.js";
import { overrideReasons } from "./feedback.js";
import type { Card, CdsHookResponse, OrderSelectRequest } from "./types.js";

const GI_PATHOGEN_PCR_LOINC = "82195-9";

interface DraftOrderResource {
  resourceType?: string;
  code?: { coding?: Array<{ system?: string; code?: string }> };
}

function draftOrderIncludesCode(request: OrderSelectRequest, code: string): boolean {
  return request.context.draftOrders.entry.some((entry) => {
    const resource = entry.resource as DraftOrderResource;
    return resource.code?.coding?.some((coding) => coding.code === code) ?? false;
  });
}

function draftOrderIncludesMedicationRequest(request: OrderSelectRequest): boolean {
  return request.context.draftOrders.entry.some((entry) => {
    const resource = entry.resource as DraftOrderResource;
    return resource.resourceType === "MedicationRequest";
  });
}

/** Whether ANY station in the network currently has an exposure window, and
 * on what basis: "confirmed" if at least one traces back to an operator's
 * report, "inferred" if every one traces back only to a statistical
 * turbidity auto-escalation (an unconfirmed signal -- SAFETY_CASE.md H2), or
 * null if none. `order-select`'s CDS Hooks context doesn't carry a geocoded
 * patient address the way `patient-view`'s prefetch does (see
 * patientView.ts's per-station nearest-station resolution), so this is a
 * deliberate, documented simplification for the demo: network-wide "is
 * anything flagged right now", not patient-location-aware (and, likewise, it
 * does not check that the drafted order is actually an antimicrobial --
 * open item H9). */
function exposureBasis(): "confirmed" | "inferred" | null {
  let inferred = false;
  for (const station of MONDEGO_STATIONS) {
    const evaluation = evaluateStationExposure(station.id);
    if (!evaluation || !(evaluation.isOwnFlag || evaluation.phase === "confirmed")) continue;
    const via = evaluation.isOwnFlag ? evaluation.confirmedVia : getStationState(evaluation.sourceStationId).confirmedVia;
    if (via !== "statistical-detection") return "confirmed";
    inferred = true;
  }
  return inferred ? "inferred" : null;
}

/**
 * Antimicrobial-stewardship trigger: if the clinician is drafting a
 * medication order (presumed empiric antimicrobial therapy) while any
 * station in the network is within a confirmed exposure window, and
 * hasn't already ordered a pathogen-identifying test, suggest pairing the
 * empiric order with the GI pathogen PCR panel.
 */
export function handleOrderSelect(request: OrderSelectRequest): CdsHookResponse {
  const basis = exposureBasis();
  if (basis === null) return { cards: [] };
  if (!draftOrderIncludesMedicationRequest(request)) return { cards: [] };
  if (draftOrderIncludesCode(request, GI_PATHOGEN_PCR_LOINC)) return { cards: [] };

  const inferred = basis === "inferred";
  // A ServiceRequest needs a subject (FHIR R4, 1..1 -- caught by the official
  // validator); without a patient id, propose no order rather than an invalid one.
  const patientId = request.context?.patientId;
  const card: Card = {
    uuid: randomUUID(),
    summary: inferred
      ? "Consider pathogen-identifying testing (stewardship) -- unconfirmed exposure signal"
      : "Pair empiric therapy with pathogen-identifying testing (stewardship)",
    // An inferred (statistical) signal is informational, never a warning.
    indicator: inferred ? "info" : "warning",
    detail:
      (inferred
        ? "A possible waterborne-exposure window has been INFERRED from a statistical turbidity anomaly at a station " +
          "in this monitored network; it has NOT been confirmed by water-authority sampling. "
        : "A station in this patient's monitored network is within a modeled active waterborne-exposure window. ") +
      "Before finalizing empiric antimicrobial therapy, consider adding a stool GI pathogen NAA panel " +
      "(LOINC 82195-9) so therapy can be de-escalated or targeted once a causative organism is identified, " +
      "per antimicrobial stewardship principles -- this does not replace or delay the empiric order itself.",
    source: { label: "OAH-Mondego (antimicrobial stewardship trigger, deterministic)" },
    suggestions: !patientId
      ? []
      : [
          {
            label: "Add: Gastrointestinal pathogens DNA/RNA panel (stool NAA) -- LOINC 82195-9",
            uuid: randomUUID(),
            actions: [
              {
                type: "create",
                description: "Add a stool-based multiplex GI pathogen NAA panel alongside the current draft order.",
                resource: {
                  resourceType: "ServiceRequest",
                  status: "draft",
                  intent: "order",
                  code: { coding: [{ system: "http://loinc.org", code: GI_PATHOGEN_PCR_LOINC }] },
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
