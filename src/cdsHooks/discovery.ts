import type { CdsDiscoveryResponse } from "./types.js";

/** Service ids advertised in discovery. Per the CDS Hooks spec a service's
 * endpoint is `{baseUrl}/cds-services/{service.id}` (and its feedback
 * endpoint `.../{service.id}/feedback`), so the server MUST answer on these
 * paths. (An earlier version served only `/cds-services/patient-view` and
 * `/cds-services/order-select`, i.e. it 404'd on the very ids it
 * advertised; those hook-name paths remain as aliases.) The Mondego-flavoured
 * ids are kept because an id is a stable identifier, not a description --
 * the patient-view service itself covers every river. */
export const PATIENT_VIEW_SERVICE_ID = "oah-mondego-biohazard-exposure";
export const ORDER_SELECT_SERVICE_ID = "oah-mondego-stewardship-trigger";

export function discoveryManifest(): CdsDiscoveryResponse {
  return {
    services: [
      {
        hook: "patient-view",
        id: PATIENT_VIEW_SERVICE_ID,
        title: "OAH: downstream waterborne biohazard exposure forecast (any monitored river)",
        description:
          "Flags patients whose home address falls near any monitored river station (Mondego, Douro, Tagus, " +
          "Danube, Rhine, Elbe, Oder) with a predicted or confirmed biohazard exposure window, computed from a " +
          "1D advection-dispersion transport model of an upstream contamination event.",
        prefetch: { patient: "Patient/{{context.patientId}}" },
      },
      {
        hook: "order-select",
        id: ORDER_SELECT_SERVICE_ID,
        title: "OAH-Mondego: waterborne-exposure antimicrobial stewardship trigger",
        description:
          "Suggests pairing empiric antimicrobial therapy with a pathogen-identifying stool NAA panel " +
          "(LOINC 82195-9) for patients within a confirmed exposure window. Scoped to the Mondego (Coimbra) " +
          "network only: an order-select context carries no patient location to pick a river from.",
      },
    ],
  };
}
