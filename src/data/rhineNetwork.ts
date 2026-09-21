/**
 * Rhine: 4 stations across France, Germany and the Netherlands.
 *
 * PROVENANCE:
 *  - River facts (1,230 km, 185,000 km^2 basin, source at Tomasee in
 *    Graubunden, Switzerland, mouth at the North Sea in the Netherlands)
 *    are from the Rhine's own Wikipedia infobox, fetched directly.
 *  - Station coordinates are each city's own Wikipedia infobox, fetched
 *    directly. CITY-CENTRE points, not river gauges -- and Strasbourg's is
 *    on the Ill, which Wikipedia says flows roughly 4 km from the Rhine
 *    (the Rhine forms the eastern edge of the modern city and the
 *    Franco-German border). Lobith is, per Wikipedia, "traditionally" where
 *    the Rhine enters the Netherlands, though in reality that happens about
 *    4 km further upstream near Spijk.
 *  - The order Strasbourg -> Mainz -> Cologne -> Lobith is downstream: the
 *    river flows from Switzerland to the North Sea, and latitude increases
 *    along it (asserted in test/catchments.test.ts).
 *  - Real governance, confirmed directly on iksr.org: the ICPR's
 *    International Warning and Alarm Plan Rhine. Recipients the page names
 *    are "the authorities and drinking water works in the Rhine bordering
 *    countries".
 */

import {
  type CatchmentDefinition,
  ILLUSTRATIVE_LARGE_RIVER_VELOCITY_MS,
  type NetworkStation,
  STRAIGHT_LINE_DISTANCE_ROW,
  VELOCITY_ROW,
} from "./networkTypes.js";

export const RHINE_STATIONS: NetworkStation[] = [
  {
    id: "FR-STRASBOURG",
    name: "Strasbourg",
    country: "FR",
    latitude: 48.58333,
    longitude: 7.74583,
    verified: true,
    verificationNote:
      "Real city; Wikipedia: the Rhine forms the Franco-German border along the city's eastern edge, but the historic core lies on the Ill, roughly 4 km from the Rhine. Infobox (city-centre) coordinates, fetched directly.",
  },
  {
    id: "DE-MAINZ",
    name: "Mainz",
    country: "DE",
    latitude: 49.99944,
    longitude: 8.27361,
    verified: true,
    verificationNote:
      "Real city; Wikipedia: 'on the left bank of the Rhine'. Infobox coordinates, fetched directly.",
  },
  {
    id: "DE-COLOGNE",
    name: "Cologne",
    country: "DE",
    latitude: 50.93639,
    longitude: 6.95278,
    verified: true,
    verificationNote:
      "Real city; Wikipedia: 'located on the River Rhine (Lower Rhine)', centred on its left bank. Infobox coordinates, fetched directly.",
  },
  {
    id: "NL-LOBITH",
    name: "Lobith",
    country: "NL",
    latitude: 51.86167,
    longitude: 6.11806,
    verified: true,
    verificationNote:
      "Real village; Wikipedia: 'traditionally' where the Rhine enters the Netherlands (in reality ~4 km further upstream, near Spijk). Infobox coordinates, fetched directly.",
  },
];

export const RHINE_FLOW_ORDER: string[] = RHINE_STATIONS.map((s) => s.id);

export const RHINE_CATCHMENT: CatchmentDefinition = {
  id: "rhine",
  catchmentId: "rhine-eu",
  label: "Rhine",
  region: "France → Germany → Netherlands",
  stations: RHINE_STATIONS,
  flowOrder: RHINE_FLOW_ORDER,
  meanVelocityMs: ILLUSTRATIVE_LARGE_RIVER_VELOCITY_MS,
  riverLengthKm: 1230,
  basinAreaKm2: 185_000,
  governance: {
    name: "ICPR International Warning and Alarm Plan Rhine (IWAP)",
    note:
      "Real, confirmed on iksr.org: since 1985 seven international main warning centres (R1-R7) cooperate within the IWAP, which warns and informs the authorities and drinking water works in the Rhine bordering countries when a sudden pollution event occurs in the Rhine, Neckar, Main or minor tributaries, mainly via an internet application.",
  },
  provenance: [
    {
      claim: "Rhine: 1,230 km, 185,000 km² basin, source Tomasee (CH), mouth North Sea (NL)",
      status: "verified",
      note: "From the river's own Wikipedia infobox, fetched directly.",
    },
    {
      claim: "All 4 station names and coordinates (Strasbourg, Mainz, Cologne, Lobith)",
      status: "verified",
      note: "Each fetched from that place's own Wikipedia infobox. City-centre points, not river gauges: Strasbourg's is ~4 km from the Rhine (on the Ill), and Lobith is only 'traditionally' where the Rhine enters the Netherlands.",
    },
    {
      claim: "Upstream-to-downstream order (Strasbourg → Mainz → Cologne → Lobith)",
      status: "verified",
      note: "The river's direction (Switzerland → North Sea) is confirmed and latitude increases monotonically along the order -- asserted in test/catchments.test.ts.",
    },
    {
      claim: "The Rhine's International Warning and Alarm Plan warns authorities and drinking water works",
      status: "verified",
      note: "Confirmed directly on iksr.org. The recipients the page names are authorities and drinking water works; this prototype explores what a clinical hand-off could add, and does not claim none exists.",
    },
    STRAIGHT_LINE_DISTANCE_ROW,
    VELOCITY_ROW,
  ],
};
