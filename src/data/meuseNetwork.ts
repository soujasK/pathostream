/**
 * Meuse (Maas): 4 stations across France, Belgium and the Netherlands --
 * added specifically to bring Belgium into this project's EU coverage (the
 * 7 original rivers spanned 13 of 27 EU member states; Belgium was not
 * one of them).
 *
 * PROVENANCE:
 *  - River facts (925 km, 34,548 km^2 basin, source in France, mouth at
 *    the North Sea via the Rhine-Meuse-Scheldt Delta) are from the Meuse's
 *    own Wikipedia infobox, fetched directly.
 *  - Station coordinates are each city's own Wikipedia infobox, fetched
 *    directly, and each article confirms the city sits directly on the
 *    Meuse (not a tributary) -- Charleville-Mezieres "on the banks of the
 *    river Meuse"; Namur "at the confluence of the rivers Sambre and
 *    Meuse"; Liege "in the valley of the Meuse ... the Meuse meets the
 *    river Ourthe"; Maastricht "on both sides of the Meuse ... where the
 *    river is joined by the Jeker". CITY-CENTRE points, not river gauges.
 *  - Order: France -> Belgium -> Netherlands, matching the infobox's own
 *    stated course; latitude and longitude both increase monotonically
 *    along it (asserted in test/catchments.test.ts).
 *  - Real governance: an International Commission on the Meuse implements
 *    a 2002 Ghent treaty among France, Germany, Luxembourg, the
 *    Netherlands and Belgium on managing the river -- confirmed directly
 *    against the river's own Wikipedia article.
 */

import {
  type CatchmentDefinition,
  ILLUSTRATIVE_LARGE_RIVER_VELOCITY_MS,
  type NetworkStation,
  STRAIGHT_LINE_DISTANCE_ROW,
  VELOCITY_ROW,
} from "./networkTypes.js";

export const MEUSE_STATIONS: NetworkStation[] = [
  {
    id: "FR-CHARLEVILLE-MEZIERES",
    name: "Charleville-Mézières",
    country: "FR",
    latitude: 49.7719,
    longitude: 4.7161,
    verified: true,
    verificationNote:
      "Real city; Wikipedia: 'located on the banks of the river Meuse'. Infobox coordinates, fetched directly.",
  },
  {
    id: "BE-NAMUR",
    name: "Namur",
    country: "BE",
    latitude: 50.467,
    longitude: 4.867,
    verified: true,
    verificationNote:
      "Real city; Wikipedia: 'stands at the confluence of the rivers Sambre and Meuse'. Infobox coordinates, fetched directly.",
  },
  {
    id: "BE-LIEGE",
    name: "Liège",
    country: "BE",
    latitude: 50.63972,
    longitude: 5.57056,
    verified: true,
    verificationNote:
      "Real city; Wikipedia: 'situated in the valley of the Meuse, in the east of Belgium'. Infobox coordinates, fetched directly.",
  },
  {
    id: "NL-MAASTRICHT",
    name: "Maastricht",
    country: "NL",
    latitude: 50.85,
    longitude: 5.683,
    verified: true,
    verificationNote:
      "Real city; Wikipedia: 'located on both sides of the Meuse (Dutch: Maas), at the point where the river is joined by the Jeker'. Infobox coordinates, fetched directly.",
  },
];

export const MEUSE_FLOW_ORDER: string[] = MEUSE_STATIONS.map((s) => s.id);

export const MEUSE_CATCHMENT: CatchmentDefinition = {
  id: "meuse",
  catchmentId: "meuse-eu",
  label: "Meuse",
  region: "France → Belgium → Netherlands",
  stations: MEUSE_STATIONS,
  flowOrder: MEUSE_FLOW_ORDER,
  meanVelocityMs: ILLUSTRATIVE_LARGE_RIVER_VELOCITY_MS,
  riverLengthKm: 925,
  basinAreaKm2: 34_548,
  governance: {
    name: "International Commission on the Meuse (2002 Ghent Agreement)",
    note:
      "Per the river's own Wikipedia article (fetched directly): an international agreement was signed in 2002 in Ghent, Belgium, on management of the river among France, Germany, Luxembourg, the Netherlands and Belgium, and an International Commission on the Meuse has responsibility for implementing it.",
  },
  provenance: [
    {
      claim: "Meuse: 925 km, 34,548 km² basin, source France, mouth North Sea (Rhine-Meuse-Scheldt Delta)",
      status: "verified",
      note: "From the river's own Wikipedia infobox, fetched directly.",
    },
    {
      claim: "All 4 station names and coordinates (Charleville-Mézières, Namur, Liège, Maastricht)",
      status: "verified",
      note: "Each fetched from that city's own Wikipedia infobox, and each article confirms the city sits directly on the Meuse (not a tributary). City-centre points, not river gauges.",
    },
    {
      claim: "Upstream-to-downstream order (Charleville-Mézières → Namur → Liège → Maastricht)",
      status: "verified",
      note: "Follows the river's real course through France, Belgium and the Netherlands; latitude and longitude both increase monotonically station to station -- asserted in test/catchments.test.ts.",
    },
    {
      claim: "International Commission on the Meuse / 2002 Ghent Agreement",
      status: "verified",
      note: "Confirmed directly against the river's own Wikipedia article, which names the treaty, its signing city and year, and the five signatory countries.",
    },
    {
      claim: "A named hospital for the Meuse network",
      status: "illustrative",
      note: "No -- no hospital is named outside Coimbra; a clinician card here refers to \"your institution's protocol\" rather than inventing one.",
    },
    STRAIGHT_LINE_DISTANCE_ROW,
    VELOCITY_ROW,
  ],
};
