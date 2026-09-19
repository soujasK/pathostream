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
export {};
