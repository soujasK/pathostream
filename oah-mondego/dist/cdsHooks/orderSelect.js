import { randomUUID } from "node:crypto";
import { evaluateExposure } from "./exposureEngine.js";
const GI_PATHOGEN_PCR_LOINC = "82195-9";
function draftOrderIncludesCode(request, code) {
    return request.context.draftOrders.entry.some((entry) => {
        const resource = entry.resource;
        return resource.code?.coding?.some((coding) => coding.code === code) ?? false;
    });
}
function draftOrderIncludesMedicationRequest(request) {
    return request.context.draftOrders.entry.some((entry) => {
        const resource = entry.resource;
        return resource.resourceType === "MedicationRequest";
    });
}
/**
 * Antimicrobial-stewardship trigger: if the clinician is drafting a
 * medication order (presumed empiric antimicrobial therapy) for a patient
 * currently inside a CONFIRMED exposure window, and hasn't already ordered
 * a pathogen-identifying test, suggest pairing the empiric order with the
 * GI pathogen PCR panel -- treat now, but also test, so therapy can be
 * de-escalated once a specific pathogen is identified (a real stewardship
 * principle, not just "order more tests").
 */
export function handleOrderSelect(request) {
    const evaluation = evaluateExposure();
    if (!evaluation || evaluation.phase !== "confirmed")
        return { cards: [] };
    if (!draftOrderIncludesMedicationRequest(request))
        return { cards: [] };
    if (draftOrderIncludesCode(request, GI_PATHOGEN_PCR_LOINC))
        return { cards: [] };
    const card = {
        uuid: randomUUID(),
        summary: "Pair empiric therapy with pathogen-identifying testing (stewardship)",
        indicator: "warning",
        detail: "This patient is within a modeled active waterborne-exposure window. Before finalizing empiric " +
            "antimicrobial therapy, consider adding a stool GI pathogen NAA panel (LOINC 82195-9) so therapy can " +
            "be de-escalated or targeted once a causative organism is identified, per antimicrobial stewardship " +
            "principles -- this does not replace or delay the empiric order itself.",
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
