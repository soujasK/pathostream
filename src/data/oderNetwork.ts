/**
 * Oder (Odra): 4 stations across Poland and the Polish-German border.
 *
 * PROVENANCE:
 *  - River facts (840 km, 119,074 km^2 basin, source at Fidluv kopec in the
 *    Czech Republic, mouth at the Szczecin Lagoon on the Baltic) are from
 *    the Oder's own Wikipedia infobox, fetched directly. That infobox also
 *    lists the river's cities in downstream order (... Opole ... Wroclaw
 *    ... Frankfurt (Oder) ... Szczecin ...), which is the order used here.
 *  - Station coordinates are each city's own Wikipedia infobox, fetched
 *    directly, and each article confirms the city lies on the Oder
 *    (Frankfurt sits on its western bank opposite Slubice, on the
 *    German-Polish border). CITY-CENTRE points, not river gauges.
 *  - Why this river: the 2022 Oder environmental disaster is a real
 *    cross-border warning failure (see the `governance` note and
 *    `provenance` rows, every fact from Wikipedia's article on it, fetched
 *    directly). This prototype's turbidity signal is NOT claimed to detect
 *    a toxic algal bloom -- the point of including the Oder is the missing
 *    cross-border hand-off, not the sensor.
 */

import {
  type CatchmentDefinition,
  ILLUSTRATIVE_LARGE_RIVER_VELOCITY_MS,
  type NetworkStation,
  STRAIGHT_LINE_DISTANCE_ROW,
  VELOCITY_ROW,
} from "./networkTypes.js";

export const ODER_STATIONS: NetworkStation[] = [
  {
    id: "PL-OPOLE",
    name: "Opole",
    country: "PL",
    latitude: 50.66667,
    longitude: 17.92417,
    verified: true,
    verificationNote:
      "Real city; Wikipedia: 'located in southern Poland on the Oder River'. Infobox coordinates, fetched directly.",
  },
  {
    id: "PL-WROCLAW",
    name: "Wrocław",
    country: "PL",
    latitude: 51.11,
    longitude: 17.0325,
    verified: true,
    verificationNote:
      "Real city; Wikipedia: 'lies on the banks of the Oder (Odra) River'. Infobox coordinates, fetched directly.",
  },
  {
    id: "DE-FRANKFURT-ODER",
    name: "Frankfurt (Oder)",
    country: "DE",
    latitude: 52.341944,
    longitude: 14.551667,
    verified: true,
    verificationNote:
      "Real city; Wikipedia: on the western bank of the Oder, opposite the Polish town of Słubice -- the German-Polish border runs along the Oder. Infobox coordinates, fetched directly.",
  },
  {
    id: "PL-SZCZECIN",
    name: "Szczecin",
    country: "PL",
    latitude: 53.4325,
    longitude: 14.54806,
    verified: true,
    verificationNote:
      "Real city; Wikipedia: 'located on the Oder River, south of the Szczecin Lagoon'. Infobox coordinates, fetched directly.",
  },
];

export const ODER_FLOW_ORDER: string[] = ODER_STATIONS.map((s) => s.id);

export const ODER_CATCHMENT: CatchmentDefinition = {
  id: "oder",
  catchmentId: "oder-eu",
  label: "Oder",
  region: "Poland → Germany border → Poland",
  stations: ODER_STATIONS,
  flowOrder: ODER_FLOW_ORDER,
  meanVelocityMs: ILLUSTRATIVE_LARGE_RIVER_VELOCITY_MS,
  riverLengthKm: 840,
  basinAreaKm2: 119_074,
  governance: {
    name: "2022 Oder environmental disaster (a real cross-border warning failure)",
    note:
      "Per Wikipedia (fetched directly): fish die-offs were first reported near Oława in March 2022 and resumed at the end of July; on 11 August volunteers removed at least 10 tonnes from a 200 km stretch; over 100 tonnes were removed from Polish sections and 35 from German ones. A February 2023 European Commission report concluded the direct cause was prymnesin toxins from Prymnesium parvum algae, enabled by saline industrial wastewater discharge on the Polish side. The article states German officials complained about a lack of communication from Polish officials and that Polish authorities were slow to react.",
  },
  provenance: [
    {
      claim: "Oder: 840 km, 119,074 km² basin, source Czech Republic, mouth Szczecin Lagoon (Baltic)",
      status: "verified",
      note: "From the river's own Wikipedia infobox, fetched directly.",
    },
    {
      claim: "All 4 station names and coordinates (Opole, Wrocław, Frankfurt (Oder), Szczecin)",
      status: "verified",
      note: "Each fetched from that city's own Wikipedia infobox, and each article confirms the city lies on the Oder. City-centre points, not river gauges.",
    },
    {
      claim: "Upstream-to-downstream order",
      status: "verified",
      note: "The Oder's Wikipedia infobox lists its cities in downstream order (… Opole … Wrocław … Frankfurt (Oder) … Szczecin); latitude also increases monotonically -- asserted in test/catchments.test.ts.",
    },
    {
      claim: "The 2022 Oder die-off was a real event with a real cross-border communication problem",
      status: "verified",
      note: "Every figure and quote in the governance note above is from Wikipedia's article on the disaster, fetched directly (its cause statement cites a February 2023 European Commission report). This prototype makes no claim it would have prevented it.",
    },
    {
      claim: "This prototype's turbidity signal would have detected the Oder event",
      status: "illustrative",
      note: "No. The cause was a toxic algal bloom, which a turbidity control chart is not claimed to catch. The point of including the Oder is the missing cross-border hand-off, not the sensor.",
    },
    STRAIGHT_LINE_DISTANCE_ROW,
    VELOCITY_ROW,
  ],
};
