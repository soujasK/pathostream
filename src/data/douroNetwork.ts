/**
 * A real CROSS-BORDER monitoring network on the Douro (Portuguese name) /
 * Duero (Spanish name) river, spanning Spain and Portugal -- unlike the
 * Mondego network (entirely within Portugal), this demonstrates the same
 * FHIR/CDS-Hooks propagation pattern across an actual EU international
 * river basin.
 *
 * PROVENANCE -- read before trusting any number here:
 *  - River facts (897 km total length, 98,400 km^2 basin -- the largest in
 *    the Iberian Peninsula, source at Picos de Urbion near Duruelo de la
 *    Sierra, Soria Province, Spain, mouth at Foz do Douro, Porto, Portugal)
 *    are independently confirmed against the Douro river's own Wikipedia
 *    infobox, fetched directly.
 *  - All 4 station coordinates below are independently fetched directly
 *    from each place's own Wikipedia infobox, not estimated or recalled:
 *    Zamora, Barca d'Alva, Peso da Regua, Porto.
 *  - Real cross-border governance: Spain and Portugal jointly manage the
 *    Douro (along with the Minho, Lima, Tejo and Guadiana) under the
 *    "Convention on Cooperation for the Protection and Sustainable Use of
 *    the Waters of the Spanish-Portuguese River Basins" (the Albufeira
 *    Convention), signed 30 November 1998, in force since 17 January
 *    2000 -- independently confirmed via multiple secondary sources
 *    (Iberdrola, Waterhub.pt, academic literature on WFD implementation
 *    in the Douro basin). The Convention establishes a real-time
 *    hydrometeorological data-sharing protocol between the two countries
 *    for these shared basins, plus monthly monitoring -- this network is
 *    a small, illustrative demonstration of what a FHIR-based version of
 *    that real data-sharing obligation could look like, not a claim that
 *    either government's real system uses FHIR today.
 *  - We could NOT independently confirm a specific pollution-incident
 *    cross-border notification clause in the Convention (only the
 *    real-time hydrometeorological data-sharing and monthly-monitoring
 *    provisions were confirmed) -- not asserted here for that reason.
 *  - The upstream-to-downstream ORDER (Zamora -> Barca d'Alva -> Peso da
 *    Regua -> Porto) follows the river's real, confirmed west-flowing
 *    course from Spain to the Atlantic; it is not a survey of this
 *    specific reach's hydraulic flow but the river's well-documented
 *    general direction and the stations' real, independently confirmed
 *    positions along it (monotonically decreasing longitude).
 *  - `meanVelocityMs`/dispersion parameters are illustrative, documented
 *    defaults, same disclosure as `mondegoNetwork.ts`.
 */

import type { NetworkStation } from "./mondegoNetwork.js";

export const DOURO_CATCHMENT_ID = "douro-transboundary";

export const DOURO_RIVER_LENGTH_KM = 897;
export const DOURO_BASIN_AREA_KM2 = 98_400;

/** Real bilateral treaty governing this and 4 other shared Spain-Portugal
 * river basins -- see module docstring for what is and is not
 * independently confirmed about its provisions. */
export const ALBUFEIRA_CONVENTION_NOTE =
  "Convention on Cooperation for the Protection and Sustainable Use of the Waters of the " +
  "Spanish-Portuguese River Basins (the Albufeira Convention), signed 30 November 1998, in force " +
  "since 17 January 2000. Confirmed real-time hydrometeorological data-sharing and monthly " +
  "monitoring provisions for the shared Minho, Lima, Douro, Tejo and Guadiana basins.";

export interface CrossBorderStation extends NetworkStation {
  country: "ES" | "PT";
}

export const DOURO_STATIONS: CrossBorderStation[] = [
  {
    id: "ES-ZAMORA",
    name: "Zamora",
    country: "ES",
    latitude: 41.49889,
    longitude: -5.75556,
    verified: true,
    verificationNote:
      "Real city (population ~59,800, capital of Zamora Province, Castile and Leon) that Wikipedia " +
      "confirms 'straddles the Duero river' -- coordinates from its infobox, fetched directly.",
  },
  {
    id: "PT-BARCA-DALVA",
    name: "Barca d'Alva",
    country: "PT",
    latitude: 41.02694,
    longitude: -6.94111,
    verified: true,
    verificationNote:
      "Real village, historic Douro-railway terminus, independently confirmed to sit less than 1km " +
      "from the Spain-Portugal border defined by the Douro and Agueda rivers -- i.e. essentially " +
      "the point the Douro crosses from Spain into Portugal. Coordinates from its infobox.",
  },
  {
    id: "PT-PESO-DA-REGUA",
    name: "Peso da Régua",
    country: "PT",
    latitude: 41.16528,
    longitude: -7.77639,
    verified: true,
    verificationNote:
      "Real Douro-valley town, historic port-wine shipping point, independently confirmed to sit " +
      "directly on the Douro. Coordinates from its infobox.",
  },
  {
    id: "PT-PORTO",
    name: "Porto (Foz do Douro)",
    country: "PT",
    latitude: 41.15,
    longitude: -8.6108,
    verified: true,
    verificationNote:
      "Real city; the Douro's confirmed Atlantic mouth ('Foz do Douro') per the river's own " +
      "Wikipedia infobox. Coordinates are Porto's city-center infobox coordinates, not the precise " +
      "river-mouth point specifically.",
  },
];

/** Upstream-to-downstream order, Spain to the Atlantic -- see module
 * docstring for the sourcing behind this sequence. */
export const DOURO_FLOW_ORDER: string[] = DOURO_STATIONS.map((s) => s.id);

/** Not independently verified against a real gauge reading -- an
 * illustrative, documented default, same disclosure as the Mondego
 * network's 0.36 m/s. Kept distinct from the Mondego constant since the
 * Douro is a much larger river and a shared default would be misleading. */
export const DOURO_MEAN_VELOCITY_MS = 0.5;

export function douroStationById(id: string): CrossBorderStation | undefined {
  return DOURO_STATIONS.find((s) => s.id === id);
}
