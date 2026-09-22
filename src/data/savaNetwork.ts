/**
 * Sava: 4 stations across Slovenia and Croatia -- added specifically to
 * bring Slovenia into this project's EU coverage. The Sava continues into
 * Bosnia-Herzegovina and Serbia (both non-EU) before joining the Danube at
 * Belgrade; no station is modeled on that non-EU reach, the same choice
 * already made for the Danube (which stops before Serbia).
 *
 * PROVENANCE:
 *  - River facts (992 km including the 45 km Sava Dolinka headwater,
 *    97,713.2 km^2 basin, source in Slovenia, mouth at the Danube in
 *    Belgrade) are from the Sava's own Wikipedia infobox, fetched
 *    directly.
 *  - Station coordinates are each town's own Wikipedia infobox, fetched
 *    directly, and each article confirms the town sits directly on the
 *    Sava. Ljubljana was deliberately EXCLUDED: Wikipedia's Sava article
 *    itself notes the river passes near the city via the Ljubljanica, a
 *    tributary, not the Sava itself -- the same category of exclusion
 *    already applied to Prague (Elbe/Vltava) and partly to Strasbourg
 *    (Rhine/Ill) elsewhere in this project.
 *  - Order: Kranj -> Litija (Slovenia) -> Zagreb -> Sisak (Croatia),
 *    matching the river's real course; latitude decreases and longitude
 *    increases monotonically along it (asserted in test/catchments.test.ts).
 *  - Real governance: the International Sava River Basin Commission
 *    (ISRBC), established 2005 by Bosnia-Herzegovina, Croatia, Slovenia
 *    and Serbia and Montenegro -- confirmed directly against the river's
 *    own Wikipedia article.
 */

import {
  type CatchmentDefinition,
  ILLUSTRATIVE_LARGE_RIVER_VELOCITY_MS,
  type NetworkStation,
  STRAIGHT_LINE_DISTANCE_ROW,
  VELOCITY_ROW,
} from "./networkTypes.js";

export const SAVA_STATIONS: NetworkStation[] = [
  {
    id: "SI-KRANJ",
    name: "Kranj",
    country: "SI",
    latitude: 46.233,
    longitude: 14.367,
    verified: true,
    verificationNote:
      "Real city; Wikipedia: the old town 'was built at the confluence of the Kokra and Sava rivers'. Infobox coordinates, fetched directly.",
  },
  {
    id: "SI-LITIJA",
    name: "Litija",
    country: "SI",
    latitude: 46.067,
    longitude: 14.817,
    verified: true,
    verificationNote:
      "Real town; Wikipedia: 'located in the valley of the Sava River, east of the capital Ljubljana' and 'lies on both banks of the Sava River'. Infobox coordinates, fetched directly.",
  },
  {
    id: "HR-ZAGREB",
    name: "Zagreb",
    country: "HR",
    latitude: 45.81306,
    longitude: 15.9775,
    verified: true,
    verificationNote:
      "Real city; Wikipedia: 'in the north of the country, along the Sava River'. Infobox coordinates, fetched directly.",
  },
  {
    id: "HR-SISAK",
    name: "Sisak",
    country: "HR",
    latitude: 45.48722,
    longitude: 16.37611,
    verified: true,
    verificationNote:
      "Real city; Wikipedia: 'spanning the confluence of the Kupa, Sava and Odra rivers'. Infobox coordinates, fetched directly.",
  },
];

export const SAVA_FLOW_ORDER: string[] = SAVA_STATIONS.map((s) => s.id);

export const SAVA_CATCHMENT: CatchmentDefinition = {
  id: "sava",
  catchmentId: "sava-eu",
  label: "Sava",
  region: "Slovenia → Croatia (EU reach; continues to non-EU Bosnia/Serbia, not modeled)",
  stations: SAVA_STATIONS,
  flowOrder: SAVA_FLOW_ORDER,
  meanVelocityMs: ILLUSTRATIVE_LARGE_RIVER_VELOCITY_MS,
  riverLengthKm: 992,
  basinAreaKm2: 97_713.2,
  governance: {
    name: "International Sava River Basin Commission (ISRBC, 2005)",
    note:
      "Per the river's own Wikipedia article (fetched directly): the ISRBC is a cooperative body established by Bosnia-Herzegovina, Croatia, Slovenia and Serbia and Montenegro in 2005, tasked with sustainable management of surface water and groundwater resources in the Sava River basin.",
  },
  provenance: [
    {
      claim: "Sava: 992 km (incl. 45 km Sava Dolinka headwater), 97,713.2 km² basin, source Slovenia, mouth at the Danube in Belgrade",
      status: "verified",
      note: "From the river's own Wikipedia infobox, fetched directly.",
    },
    {
      claim: "All 4 station names and coordinates (Kranj, Litija, Zagreb, Sisak)",
      status: "verified",
      note: "Each fetched from that place's own Wikipedia infobox, and each article confirms the place sits directly on the Sava (not a tributary). City-centre points, not river gauges.",
    },
    {
      claim: "Ljubljana is on this river network",
      status: "illustrative",
      note: "No -- deliberately excluded. The Sava's own Wikipedia article describes it flowing near Ljubljana via the Ljubljanica, a tributary, not the Sava itself.",
    },
    {
      claim: "Upstream-to-downstream order (Kranj → Litija → Zagreb → Sisak)",
      status: "verified",
      note: "Follows the river's real course through Slovenia and Croatia; latitude decreases and longitude increases monotonically station to station -- asserted in test/catchments.test.ts.",
    },
    {
      claim: "International Sava River Basin Commission (ISRBC, established 2005)",
      status: "verified",
      note: "Confirmed directly against the river's own Wikipedia article, which names the commission, its founding year and its four founding parties.",
    },
    {
      claim: "This network covers the Sava's full course to the Danube",
      status: "illustrative",
      note: "No -- only the EU (Slovenia/Croatia) reach is modeled. The river continues through non-EU Bosnia-Herzegovina and Serbia before reaching the Danube at Belgrade; no station is placed there, the same choice already made for the Danube's own non-EU (Serbian) reach.",
    },
    {
      claim: "A named hospital for the Sava network",
      status: "illustrative",
      note: "No -- no hospital is named outside Coimbra; a clinician card here refers to \"your institution's protocol\" rather than inventing one.",
    },
    STRAIGHT_LINE_DISTANCE_ROW,
    VELOCITY_ROW,
  ],
};
