import type { CdsHookResponse, OrderSelectRequest } from "./types.js";
/**
 * Antimicrobial-stewardship trigger: if the clinician is drafting a
 * medication order (presumed empiric antimicrobial therapy) for a patient
 * currently inside a CONFIRMED exposure window, and hasn't already ordered
 * a pathogen-identifying test, suggest pairing the empiric order with the
 * GI pathogen PCR panel -- treat now, but also test, so therapy can be
 * de-escalated once a specific pathogen is identified (a real stewardship
 * principle, not just "order more tests").
 */
export declare function handleOrderSelect(request: OrderSelectRequest): CdsHookResponse;
