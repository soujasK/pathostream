/**
 * Danube: the EU's most international river -- 7 stations across 7 EU
 * member states (DE, AT, SK, HU, HR, BG, RO).
 *
 * PROVENANCE -- read before trusting any number here:
 *  - River facts (2,850 km, 801,463 km^2 basin, source at Donaueschingen,
 *    mouth in the Danube Delta on the Black Sea) are from the Danube's own
 *    Wikipedia infobox, fetched directly.
 *  - Each station's coordinates come from that city's own Wikipedia
 *    infobox, fetched directly, and each article was checked to confirm the
 *    city lies on the Danube (Passau: where the Inn and Ilz join it;
 *    Vienna; Bratislava "straddles" it; Budapest; Vukovar: at the Vuka
 *    confluence, Croatia's largest river port; Ruse: right bank, opposite
 *    Giurgiu, Romania; Galati: a Danube port). All are CITY-CENTRE points,
 *    not river gauges.
 *  - The order Passau -> Vienna -> Bratislava -> Budapest -> Vukovar ->
 *    Ruse -> Galati follows the river's course; it is NOT a surveyed
 *    river-kilometre check. Between Vukovar and Ruse the Danube runs
 *    through/along Serbia (non-EU), where no station is modeled.
 *  - Real governance: the ICPDR operates an Accident Emergency Warning
 *    System that notifies downstream countries of accidental transboundary
 *    pollution. Confirmed via several ICPDR pages surfaced in search; the
 *    ICPDR site blocked a direct page fetch (HTTP 403), so no operating
 *    history or incident counts are quoted.
 */

import {
  type CatchmentDefinition,
  ILLUSTRATIVE_LARGE_RIVER_VELOCITY_MS,
  type NetworkStation,
  STRAIGHT_LINE_DISTANCE_ROW,
  VELOCITY_ROW,
} from "./networkTypes.js";

export const DANUBE_STATIONS: NetworkStation[] = [
  {
    id: "DE-PASSAU",
    name: "Passau",
    country: "DE",
    latitude: 48.57444,
    longitude: 13.46472,
    verified: true,
    verificationNote:
      "Real city in Lower Bavaria; Wikipedia: the Danube is joined there by the Inn and the Ilz, and many Danube river cruises start there. Infobox coordinates, fetched directly.",
  },
  {
    id: "AT-VIENNA",
    name: "Vienna",
    country: "AT",
    latitude: 48.2083,
    longitude: 16.3725,
    verified: true,
    verificationNote:
      "Real capital; Wikipedia: 'It sits on the Danube' and is the most populous city on the river. Infobox coordinates, fetched directly.",
  },
  {
    id: "SK-BRATISLAVA",
    name: "Bratislava",
    country: "SK",
    latitude: 48.14389,
    longitude: 17.10972,
    verified: true,
    verificationNote:
      "Real capital; Wikipedia: 'Bratislava straddles the Danube'. Infobox coordinates, fetched directly.",
  },
  {
    id: "HU-BUDAPEST",
    name: "Budapest",
    country: "HU",
    latitude: 47.4925,
    longitude: 19.05139,
    verified: true,
    verificationNote:
      "Real capital; Wikipedia: 'Budapest stands on the River Danube'. Infobox coordinates, fetched directly.",
  },
  {
    id: "HR-VUKOVAR",
    name: "Vukovar",
    country: "HR",
    latitude: 45.34444,
    longitude: 19.0025,
    verified: true,
    verificationNote:
      "Real city with Croatia's largest river port, at the confluence of the Vuka and the Danube (Wikipedia). Infobox coordinates, fetched directly.",
  },
  {
    id: "BG-RUSE",
    name: "Ruse",
    country: "BG",
    latitude: 43.82306,
    longitude: 25.95389,
    verified: true,
    verificationNote:
      "Real city on the right bank of the Danube, opposite Giurgiu (Romania), Bulgaria's most significant river port (Wikipedia). Infobox coordinates, fetched directly.",
  },
  {
    id: "RO-GALATI",
    name: "Galați",
    country: "RO",
    latitude: 45.43361,
    longitude: 28.05528,
    verified: true,
    verificationNote:
      "Real city; Wikipedia: 'a port town on the river Danube', sixth-largest of all cities on it. Infobox coordinates, fetched directly.",
  },
];

export const DANUBE_FLOW_ORDER: string[] = DANUBE_STATIONS.map((s) => s.id);

export const DANUBE_CATCHMENT: CatchmentDefinition = {
  id: "danube",
  catchmentId: "danube-eu",
  label: "Danube",
  region: "Germany → Austria → Slovakia → Hungary → Croatia → Bulgaria → Romania",
  stations: DANUBE_STATIONS,
  flowOrder: DANUBE_FLOW_ORDER,
  meanVelocityMs: ILLUSTRATIVE_LARGE_RIVER_VELOCITY_MS,
  riverLengthKm: 2850,
  basinAreaKm2: 801_463,
  governance: {
    name: "ICPDR Accident Emergency Warning System (AEWS)",
    note:
      "Real: an international messaging system run by the International Commission for the Protection of the Danube River that warns downstream countries of accidental transboundary pollution (SMS and e-mail). Confirmed via several ICPDR pages surfaced in search; direct page fetch was blocked, so no operating figures are quoted.",
  },
  provenance: [
    {
      claim: "Danube: 2,850 km, 801,463 km² basin, source Donaueschingen (DE), mouth Danube Delta (RO/UA)",
      status: "verified",
      note: "From the river's own Wikipedia infobox, fetched directly.",
    },
    {
      claim: "All 7 station names and coordinates (Passau, Vienna, Bratislava, Budapest, Vukovar, Ruse, Galați)",
      status: "verified",
      note: "Each fetched from that city's own Wikipedia infobox, and each article confirms the city lies on the Danube. City-centre points, not river gauges.",
    },
    {
      claim: "Upstream-to-downstream order across 7 countries",
      status: "illustrative",
      note: "Follows the river's course (DE → AT → SK → HU → HR, then Ruse → Galați toward the delta) -- not a surveyed river-kilometre check. The reach between Vukovar and Ruse runs through/along non-EU Serbia, where no station is modeled.",
    },
    {
      claim: "ICPDR Accident Emergency Warning System exists and warns downstream countries of accidental pollution",
      status: "verified",
      note: "Confirmed via several ICPDR pages surfaced in search; the ICPDR site blocked a direct fetch (HTTP 403), so no operating history or incident counts are claimed.",
    },
    STRAIGHT_LINE_DISTANCE_ROW,
    VELOCITY_ROW,
  ],
};
