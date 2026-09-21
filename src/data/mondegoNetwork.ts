/**
 * A 6-station monitoring network along the Mondego River through Coimbra,
 * in real upstream-to-downstream order -- replacing an earlier 2-point
 * reach (a single hardcoded upstream/downstream pair) with a proper
 * multi-station network.
 *
 * PROVENANCE -- read before trusting any number here:
 *  - Every station NAME below is a real, independently confirmed place on
 *    the Mondego in Coimbra (Wikipedia, Camara Municipal de Coimbra,
 *    Tripadvisor/Lonely Planet listings) -- see each station's
 *    `verificationNote`.
 *  - Three stations have coordinates sourced directly from a public
 *    reference (Wikipedia's infobox, independently fetched, not
 *    recalled): Ponte de Santa Clara, Acude-Ponte, Mata Nacional do
 *    Choupal.
 *  - Two stations (Parque Dr. Manuel Braga, Parque Choupalinho) have
 *    coordinates ESTIMATED by interpolation from confirmed textual
 *    descriptions of their position relative to verified neighbors (no
 *    precise public geocode was found for either) -- marked
 *    `coordinatesEstimated: true`. Their NAMES and real existence are
 *    still independently verified; only the precise lat/lon is an
 *    estimate.
 *  - The upstream-to-downstream ORDER is derived from real, sourced
 *    descriptions (e.g. Camara Municipal de Coimbra: "Parque Manuel Braga
 *    extends along the river between Largo da Portagem... and Parque
 *    Verde do Mondego"; "Mata Nacional do Choupal is ~0.5km north of
 *    Acude-Ponte") combined with the Mondego's real flow direction through
 *    Coimbra (southeast/city-centre toward northwest, continuing to the
 *    Atlantic at Figueira da Foz) -- not a surveyed hydrological flow
 *    analysis. Replace with an official APA/INAG flow-direction survey
 *    before treating this ordering as authoritative.
 *  - `distanceKm`/`meanVelocityMs` per-segment transport parameters remain
 *    illustrative, documented defaults -- see advectionDispersion.ts.
 */

import type { NetworkStation } from "./networkTypes.js";

// Re-exported so the many existing `import { NetworkStation } from
// ".../mondegoNetwork.js"` call sites keep working; the type itself now
// lives in networkTypes.ts, shared by every river.
export type { NetworkStation } from "./networkTypes.js";

export const MONDEGO_CATCHMENT_ID = "mondego-coimbra";

/** Real hospital serving Coimbra -- independently confirmed (Wikipedia;
 * EATRIS; hospitaisonline.pt). Used as realistic framing in CDS card copy;
 * this demo does not integrate with any real CHUC system. */
export const CHUC_ANCHOR = "Centro Hospitalar e Universitário de Coimbra (CHUC)";

export const MONDEGO_STATIONS: NetworkStation[] = [
  {
    id: "PT-SANTA-CLARA",
    country: "PT",
    name: "Ponte de Santa Clara",
    latitude: 40.20611,
    longitude: -8.43056,
    verified: true,
    verificationNote:
      "Real bridge (opened 1954, designed by Edgar Cardoso), confirmed via Wikipedia infobox coordinates, fetched directly.",
  },
  {
    id: "PT-MANUEL-BRAGA",
    country: "PT",
    name: "Parque Dr. Manuel Braga",
    latitude: 40.2043,
    longitude: -8.429,
    verified: true,
    coordinatesEstimated: true,
    verificationNote:
      "Real riverside park (1920s; Camara Municipal de Coimbra). Coordinates interpolated between the confirmed Ponte de Santa Clara and Parque Verde do Mondego positions per CMC's description of this park lying between them -- no precise public geocode found.",
  },
  {
    id: "PT-PARQUE-VERDE",
    country: "PT",
    name: "Parque Verde do Mondego",
    latitude: 40.2038,
    longitude: -8.4285,
    verified: true,
    verificationNote: "Confirmed real, well-documented park on the Mondego in Coimbra (Camara Municipal de Coimbra; public listings).",
  },
  {
    id: "PT-CHOUPALINHO",
    country: "PT",
    name: "Parque Choupalinho",
    latitude: 40.204,
    longitude: -8.431,
    verified: true,
    coordinatesEstimated: true,
    verificationNote:
      "Real park on the west bank, confirmed connected to Parque Verde do Mondego (hosts Clube Fluvial de Coimbra, Praia Fluvial do Choupalinho). Coordinates estimated near Parque Verde on the opposite bank -- no precise public geocode found.",
  },
  {
    id: "PT-ACUDE-PONTE",
    country: "PT",
    name: "Açude-Ponte",
    latitude: 40.2154,
    longitude: -8.4401,
    verified: true,
    verificationNote: "Real road bridge/weir (opened 1981, carries the A31), confirmed via independently fetched coordinates.",
  },
  {
    id: "PT-CHOUPAL",
    country: "PT",
    name: "Mata Nacional do Choupal",
    latitude: 40.22194,
    longitude: -8.44611,
    verified: true,
    verificationNote:
      "Real 79-hectare national forest along ~2km of the Mondego, confirmed via independently fetched coordinates (approximate forest centroid, not a single point feature).",
  },
];

/** Upstream-to-downstream station order -- see module docstring for the
 * sourcing behind this sequence. */
export const MONDEGO_FLOW_ORDER: string[] = MONDEGO_STATIONS.map((s) => s.id);

export function stationById(id: string): NetworkStation | undefined {
  return MONDEGO_STATIONS.find((s) => s.id === id);
}
