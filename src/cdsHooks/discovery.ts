import type { CdsDiscoveryResponse } from "./types.js";

export function discoveryManifest(): CdsDiscoveryResponse {
  return {
    services: [
      {
        hook: "patient-view",
        id: "oah-mondego-biohazard-exposure",
        title: "OAH: downstream waterborne biohazard exposure forecast (any monitored river)",
        description:
          "Flags patients whose home address falls near any monitored river station (Mondego, Douro, Tagus, " +
          "Danube, Rhine, Elbe, Oder) with a predicted or confirmed biohazard exposure window, computed from a " +
          "1D advection-dispersion transport model of an upstream contamination event.",
        prefetch: { patient: "Patient/{{context.patientId}}" },
      },
      {
        hook: "order-select",
        id: "oah-mondego-stewardship-trigger",
        title: "OAH-Mondego: waterborne-exposure antimicrobial stewardship trigger",
        description:
          "Suggests pairing empiric antimicrobial therapy with a pathogen-identifying stool NAA panel " +
          "(LOINC 82195-9) for patients within a confirmed exposure window. Scoped to the Mondego (Coimbra) " +
          "network only: an order-select context carries no patient location to pick a river from.",
      },
    ],
  };
}
