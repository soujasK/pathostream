/**
 * CDS Hooks request/response shapes.
 *
 * VERSION NOTE (same caveat as the sibling Python service's
 * app/models/cds_hooks.py): HL7's current *officially published* CDS Hooks
 * version is 2.0.1 (STU2); 3.0.0 exists only as a normative *ballot* at
 * https://cds-hooks.hl7.org at the time of writing. The `patient-view`
 * shapes below (discovery manifest; hookInstance/hook/context/prefetch;
 * cards[] with uuid/summary/indicator/detail/source/suggestions) are
 * unchanged between 2.0.1 and the 3.0 ballot text reviewed. `order-select`
 * is implemented here per the 3.0 ballot's `selections`/`draftOrders`
 * context shape specifically, at the project's explicit request --
 * re-verify against the final 3.0 release before relying on this in a
 * real deployment.
 */

export interface CdsServiceDescriptor {
  hook: "patient-view" | "order-select";
  title: string;
  description: string;
  id: string;
  prefetch?: Record<string, string>;
}

export interface CdsDiscoveryResponse {
  services: CdsServiceDescriptor[];
}

export interface CdsHookRequestBase {
  hookInstance: string;
  fhirServer?: string;
  prefetch?: Record<string, unknown>;
}

export interface PatientViewContext {
  userId: string;
  patientId: string;
  encounterId?: string;
}

export interface PatientViewRequest extends CdsHookRequestBase {
  hook: "patient-view";
  context: PatientViewContext;
}

export interface OrderSelectContext {
  userId: string;
  patientId: string;
  encounterId?: string;
  /** References to the currently-selected draft order(s). */
  selections: string[];
  /** A Bundle of draft order resources the clinician is currently building. */
  draftOrders: { resourceType: "Bundle"; entry: Array<{ resource: Record<string, unknown> }> };
}

export interface OrderSelectRequest extends CdsHookRequestBase {
  hook: "order-select";
  context: OrderSelectContext;
}

export type CdsHookRequest = PatientViewRequest | OrderSelectRequest;

export interface CardSource {
  label: string;
  url?: string;
  icon?: string;
}

export interface SuggestionAction {
  type: "create" | "update" | "delete";
  description: string;
  resource?: Record<string, unknown>;
}

export interface Suggestion {
  label: string;
  uuid: string;
  actions: SuggestionAction[];
}

export type CdsIndicator = "info" | "warning" | "critical";

export interface Card {
  uuid: string;
  summary: string;
  indicator: CdsIndicator;
  detail: string;
  source: CardSource;
  suggestions: Suggestion[];
}

export interface CdsHookResponse {
  cards: Card[];
}
