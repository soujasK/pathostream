/**
 * Tagus (Tejo/Tajo): the Iberian Peninsula's longest river, 4 stations from
 * Toledo (Spain) to Lisbon (Portugal).
 *
 * PROVENANCE:
 *  - River facts (1,007 km, 80,100 km^2 basin, source at Fuente de Garcia in
 *    Teruel, mouth an estuary at Lisbon, and a 47 km stretch forming the
 *    Spain-Portugal border) are from the Tagus's own Wikipedia infobox,
 *    fetched directly.
 *  - Station coordinates are each city's own Wikipedia infobox, fetched
 *    directly, and each article confirms the city lies on the Tagus
 *    (Toledo: right bank in a bend of the river; Abrantes; Santarem: right
 *    bank, 65 km northeast of Lisbon; Lisbon: fronting the northern shore
 *    of the river at its mouth). CITY-CENTRE points, not river gauges.
 *  - The order Toledo -> Abrantes -> Santarem -> Lisbon is the order the
 *    Tagus's Wikipedia infobox lists these cities downstream.
 *  - Real governance: the Albufeira Convention covers the Tejo (Tagus)
 *    together with the Minho, Lima, Douro and Guadiana -- confirmed the
 *    same way as for the Douro (see douroNetwork.ts).
 */

import {
  type CatchmentDefinition,
  ILLUSTRATIVE_LARGE_RIVER_VELOCITY_MS,
  type NetworkStation,
  STRAIGHT_LINE_DISTANCE_ROW,
  VELOCITY_ROW,
} from "./networkTypes.js";

export const TAGUS_STATIONS: NetworkStation[] = [
  {
    id: "ES-TOLEDO",
    name: "Toledo",
    country: "ES",
    latitude: 39.85667,
    longitude: -4.02444,
    verified: true,
    verificationNote:
      "Real city; Wikipedia: 'primarily located on the right (north) bank of the Tagus ... nestled in a bend of the river'. Infobox coordinates, fetched directly.",
  },
  {
    id: "PT-ABRANTES",
    name: "Abrantes",
    country: "PT",
    latitude: 39.46333,
    longitude: -8.1975,
    verified: true,
    verificationNote:
      "Real town; Wikipedia: the municipality is divided by the Tagus, which runs through the middle. Infobox coordinates, fetched directly.",
  },
  {
    id: "PT-SANTAREM",
    name: "Santarém",
    country: "PT",
    latitude: 39.23389,
    longitude: -8.68611,
    verified: true,
    verificationNote:
      "Real city; Wikipedia: on a plateau on the right bank of the Tagus, 65 km northeast of Lisbon. Infobox coordinates, fetched directly.",
  },
  {
    id: "PT-LISBON",
    name: "Lisbon",
    country: "PT",
    latitude: 38.72528,
    longitude: -9.15,
    verified: true,
    verificationNote:
      "Real capital; Wikipedia: 'situated at the mouth of the Tagus River', fronting its northern shore. Infobox (city-centre) coordinates, fetched directly.",
  },
];

export const TAGUS_FLOW_ORDER: string[] = TAGUS_STATIONS.map((s) => s.id);

export const TAGUS_CATCHMENT: CatchmentDefinition = {
  id: "tagus",
  catchmentId: "tagus-transboundary",
  label: "Tagus",
  region: "Spain → Portugal (cross-border)",
  stations: TAGUS_STATIONS,
  flowOrder: TAGUS_FLOW_ORDER,
  meanVelocityMs: ILLUSTRATIVE_LARGE_RIVER_VELOCITY_MS,
  riverLengthKm: 1007,
  basinAreaKm2: 80_100,
  governance: {
    name: "Albufeira Convention (1998), Spain-Portugal shared river basins",
    note:
      "Real bilateral treaty, in force since 17 January 2000, covering the Minho, Lima, Douro, Tejo (Tagus) and Guadiana, with confirmed real-time hydrometeorological data-sharing and monthly monitoring provisions. A specific pollution-incident notification clause could not be independently confirmed and is not claimed.",
  },
  provenance: [
    {
      claim: "Tagus: 1,007 km, 80,100 km² basin, source Teruel (ES), mouth estuary at Lisbon; forms a 47 km Spain–Portugal border",
      status: "verified",
      note: "From the river's own Wikipedia infobox, fetched directly.",
    },
    {
      claim: "All 4 station names and coordinates (Toledo, Abrantes, Santarém, Lisbon)",
      status: "verified",
      note: "Each fetched from that place's own Wikipedia infobox, and each article confirms it lies on the Tagus. City-centre points, not river gauges.",
    },
    {
      claim: "Upstream-to-downstream order (Toledo → Abrantes → Santarém → Lisbon)",
      status: "verified",
      note: "The Tagus's Wikipedia infobox lists these cities in downstream order; longitude also decreases monotonically -- asserted in test/catchments.test.ts.",
    },
    {
      claim: "Albufeira Convention covers the Tagus (Tejo) and provides real-time data-sharing between Spain and Portugal",
      status: "verified",
      note: "Confirmed via several secondary sources (Iberdrola, Waterhub.pt, academic literature). A pollution-notification clause could NOT be confirmed and is not claimed.",
    },
    STRAIGHT_LINE_DISTANCE_ROW,
    VELOCITY_ROW,
  ],
};
