import { randomUUID } from "node:crypto";
import { MONDEGO_STATIONS } from "../data/mondegoNetwork.js";
import { evaluateStationExposure } from "./exposureEngine.js";
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

/** True if ANY station in the network currently has a confirmed exposure
 * window. `order-select`'s CDS Hooks context doesn't carry a geocoded
 * patient address the way `patient-view`'s prefetch does (see
 * patientView.ts's per-station nearest-station resolution), so this is a
 * deliberate, documented simplification for the demo: network-wide
 * "is anything confirmed right now", not patient-location-aware. */
function anyStationConfirmed(): boolean {
  return MONDEGO_STATIONS.some((station) => {
    const evaluation = evaluateStationExposure(station.id);
    return evaluation !== null && (evaluation.isOwnFlag || evaluation.phase === "confirmed");
  });
}

/**
 * Antimicrobial-stewardship trigger: if the clinician is drafting a
 * medication order (presumed empiric antimicrobial therapy) while any
 * station in the network is within a confirmed exposure window, and
 * hasn't already ordered a pathogen-identifying test, suggest pairing the
 * empiric order with the GI pathogen PCR panel.
 */
export function handleOrderSelect(request: OrderSelectRequest): CdsHookResponse {
  if (!anyStationConfirmed()) return { cards: [] };
  if (!draftOrderIncludesMedicationRequest(request)) return { cards: [] };
  if (draftOrderIncludesCode(request, GI_PATHOGEN_PCR_LOINC)) return { cards: [] };

  const card: Card = {
    uuid: randomUUID(),
    summary: "Pair empiric therapy with pathogen-identifying testing (stewardship)",
    indicator: "warning",
    detail:
      "A station in this patient's monitored network is within a modeled active waterborne-exposure window. " +
      "Before finalizing empiric antimicrobial therapy, consider adding a stool GI pathogen NAA panel " +
      "(LOINC 82195-9) so therapy can be de-escalated or targeted once a causative organism is identified, " +
      "per antimicrobial stewardship principles -- this does not replace or delay the empiric order itself.",
    source: { label: "OAH-Mondego (antimicrobial stewardship trigger, deterministic)" },
    suggestions: [
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
            },
          },
        ],
      },
    ],
  };
  return { cards: [card] };
}
