/**
 * Elbe: 4 stations across Czechia and Germany.
 *
 * PROVENANCE:
 *  - River facts (1,112 km, 148,268 km^2 basin, source in the Giant
 *    Mountains of the Czech Republic, mouth at the North Sea at Cuxhaven)
 *    are from the Elbe's own Wikipedia infobox, fetched directly.
 *  - Station coordinates are each city's own Wikipedia infobox, fetched
 *    directly, and each article confirms the city lies on the Elbe (Usti
 *    nad Labem: at the confluence of the Elbe and Bilina, an active river
 *    port; Dresden: on both banks; Magdeburg; Hamburg: where the Elbe
 *    estuary begins). CITY-CENTRE points, not river gauges.
 *  - Prague is deliberately NOT a station: it is on the Vltava, not the
 *    Elbe.
 *  - The order Usti nad Labem -> Dresden -> Magdeburg -> Hamburg follows
 *    the river from Czechia to the North Sea (longitude decreases and
 *    latitude increases along it -- asserted in test/catchments.test.ts).
 *  - Real governance: the International Commission for the Protection of
 *    the Elbe (ICPER / IKSE), established 1990, works on an International
 *    Elbe Warning and Alarm Plan and on ALAMO, an Elbe alarm model that
 *    forecasts the spread of harmful substances. Confirmed via search
 *    results quoting ikse-mkol.org and vtei.cz; not fetched directly.
 */

import {
  type CatchmentDefinition,
  ILLUSTRATIVE_LARGE_RIVER_VELOCITY_MS,
  type NetworkStation,
  STRAIGHT_LINE_DISTANCE_ROW,
  VELOCITY_ROW,
} from "./networkTypes.js";

export const ELBE_STATIONS: NetworkStation[] = [
  {
    id: "CZ-USTI-NAD-LABEM",
    name: "Ústí nad Labem",
    country: "CZ",
    latitude: 50.65833,
    longitude: 14.04167,
    verified: true,
    verificationNote:
      "Real city; Wikipedia: at the confluence of the Elbe and Bílina, 'an active river port on the Elbe'. Infobox coordinates, fetched directly.",
  },
  {
    id: "DE-DRESDEN",
    name: "Dresden",
    country: "DE",
    latitude: 51.05,
    longitude: 13.74,
    verified: true,
    verificationNote:
      "Real city; Wikipedia: 'lies on both banks of the Elbe'. Infobox coordinates, fetched directly.",
  },
  {
    id: "DE-MAGDEBURG",
    name: "Magdeburg",
    country: "DE",
    latitude: 52.13167,
    longitude: 11.63917,
    verified: true,
    verificationNote:
      "Real city; Wikipedia: 'The city is on the Elbe river'. Infobox coordinates, fetched directly.",
  },
  {
    id: "DE-HAMBURG",
    name: "Hamburg",
    country: "DE",
    latitude: 53.55,
    longitude: 10.0,
    verified: true,
    verificationNote:
      "Real city; Wikipedia: on the Elbe, where the 110 km Elbe estuary begins. Infobox coordinates (to 0.05 degrees as published), fetched directly.",
  },
];

export const ELBE_FLOW_ORDER: string[] = ELBE_STATIONS.map((s) => s.id);

export const ELBE_CATCHMENT: CatchmentDefinition = {
  id: "elbe",
  catchmentId: "elbe-eu",
  label: "Elbe",
  region: "Czechia → Germany",
  stations: ELBE_STATIONS,
  flowOrder: ELBE_FLOW_ORDER,
  meanVelocityMs: ILLUSTRATIVE_LARGE_RIVER_VELOCITY_MS,
  riverLengthKm: 1112,
  basinAreaKm2: 148_268,
  governance: {
    name: "ICPER / IKSE (International Commission for the Protection of the Elbe River)",
    note:
      "Real: established 1990; works on an International Elbe Warning and Alarm Plan and on ALAMO, an Elbe alarm model for forecasting the spread of harmful substances -- so the water side already forecasts spread; this prototype does not claim to replace that. Confirmed via search results quoting ikse-mkol.org and vtei.cz; not fetched directly.",
  },
  provenance: [
    {
      claim: "Elbe: 1,112 km, 148,268 km² basin, source Giant Mountains (CZ), mouth North Sea at Cuxhaven",
      status: "verified",
      note: "From the river's own Wikipedia infobox, fetched directly.",
    },
    {
      claim: "All 4 station names and coordinates (Ústí nad Labem, Dresden, Magdeburg, Hamburg)",
      status: "verified",
      note: "Each fetched from that city's own Wikipedia infobox, and each article confirms the city lies on the Elbe. City-centre points, not river gauges. (Prague is on the Vltava, so it is not a station.)",
    },
    {
      claim: "Upstream-to-downstream order (Ústí → Dresden → Magdeburg → Hamburg)",
      status: "verified",
      note: "The river's direction (Czechia → North Sea) is confirmed; longitude decreases and latitude increases monotonically along the order -- asserted in test/catchments.test.ts.",
    },
    {
      claim: "The Elbe commission runs a warning and alarm plan and the ALAMO spread-forecast model",
      status: "verified",
      note: "Confirmed via search results quoting ikse-mkol.org and vtei.cz (not fetched directly).",
    },
    STRAIGHT_LINE_DISTANCE_ROW,
    VELOCITY_ROW,
  ],
};
