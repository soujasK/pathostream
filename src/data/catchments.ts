/**
 * The registry of every river network. Adding a river = add a data file
 * exporting a `CatchmentDefinition` and append it to `CATCHMENTS` -- the
 * exposure engines, HTTP routes, telemetry, patient-view lookup and the
 * dashboard's river switcher, Europe map and disclosure panel all derive
 * from this list.
 */

import { ALBUFEIRA_CONVENTION_NOTE, DOURO_BASIN_AREA_KM2, DOURO_CATCHMENT_ID, DOURO_FLOW_ORDER, DOURO_MEAN_VELOCITY_MS, DOURO_RIVER_LENGTH_KM, DOURO_STATIONS } from "./douroNetwork.js";
import { DANUBE_CATCHMENT } from "./danubeNetwork.js";
import { ELBE_CATCHMENT } from "./elbeNetwork.js";
import { CHUC_ANCHOR, MONDEGO_CATCHMENT_ID, MONDEGO_FLOW_ORDER, MONDEGO_STATIONS } from "./mondegoNetwork.js";
import { type CatchmentDefinition, type CountryCode, type NetworkStation, STRAIGHT_LINE_DISTANCE_ROW } from "./networkTypes.js";
import { ODER_CATCHMENT } from "./oderNetwork.js";
import { RHINE_CATCHMENT } from "./rhineNetwork.js";
import { TAGUS_CATCHMENT } from "./tagusNetwork.js";

const MONDEGO_CATCHMENT: CatchmentDefinition = {
  id: "mondego",
  catchmentId: MONDEGO_CATCHMENT_ID,
  label: "Mondego",
  region: "Coimbra, Portugal",
  stations: MONDEGO_STATIONS,
  flowOrder: MONDEGO_FLOW_ORDER,
  meanVelocityMs: 0.36,
  hospitalAnchor: CHUC_ANCHOR,
  provenance: [
    { claim: "All 6 network station NAMES (Santa Clara, Manuel Braga, Parque Verde, Choupalinho, Açude-Ponte, Choupal)", status: "verified", note: "Every station is a real, independently confirmed place on the Mondego in Coimbra." },
    { claim: "Coordinates: Santa Clara, Açude-Ponte, Mata Nacional do Choupal", status: "verified", note: "Sourced directly from public references (e.g. Wikipedia infoboxes), fetched independently." },
    { claim: "Coordinates: Parque Manuel Braga, Parque Choupalinho", status: "illustrative", note: "Names and existence verified; precise coordinates are estimated by interpolation (no public geocode found for these two specifically)." },
    { claim: "Upstream-to-downstream station order", status: "illustrative", note: "Derived from sourced textual descriptions + the Mondego’s real flow direction through Coimbra, not a surveyed hydrological flow analysis." },
    { claim: "LOINC 82195-9 (GI pathogens NAA panel)", status: "verified", note: "Confirmed against loinc.org." },
    { claim: "SNOMED CT 77377001 (Leptospirosis)", status: "verified", note: "Confirmed against browser.ihtsdotools.org." },
    { claim: "Centro Hospitalar e Universitário de Coimbra (CHUC)", status: "verified", note: "Real hospital; used as narrative framing only, not a live integration. The only hospital named anywhere in this prototype." },
    { claim: "Per-segment distance / velocity (0.36 m/s network-wide)", status: "illustrative", note: "No public gauge reading to check against; a documented, tunable default applied uniformly." },
    { claim: "EU WFD 5-class EQR boundaries used here", status: "illustrative", note: "The 5-class system is real; these numeric boundaries are not any member state’s official, intercalibrated ones." },
    { claim: "CDS Hooks 3.0.0", status: "illustrative", note: "A ballot draft, not yet a published HL7 standard." },
    { claim: "Leptospirosis/flooding clinical link", status: "verified", note: "Naing et al. 2019, PLoS One -- pooled OR 2.19 across 14 studies. See METHODS.md §6." },
    { claim: "Flooding doubles odds of harmful pathogen concentrations in EU water bodies", status: "verified", note: "European Environment Agency, fetched directly from eea.europa.eu. See METHODS.md §6." },
    { claim: "~40x pharmaceutical contamination spike downstream of Coimbra’s WWTP on the Mondego", status: "verified", note: "Kötke et al. 2024, Heliyon 10(15):e34825. See METHODS.md §6a." },
    { claim: "This demo’s 6 stations are OneAquaHealth’s real Coimbra field sites", status: "illustrative", note: "No -- the real project monitors small tributary streams, not these Mondego-riverbank landmarks. See METHODS.md §6b." },
    { claim: "OneAquaHealth is a real, active EUR 4.9M Horizon Europe project (Univ. of Coimbra)", status: "verified", note: "Confirmed directly against its CORDIS project page, grant 101086521. See METHODS.md §6b." },
  ],
};

const DOURO_CATCHMENT: CatchmentDefinition = {
  id: "douro",
  catchmentId: DOURO_CATCHMENT_ID,
  label: "Douro",
  region: "Spain → Portugal (cross-border)",
  stations: DOURO_STATIONS,
  flowOrder: DOURO_FLOW_ORDER,
  meanVelocityMs: DOURO_MEAN_VELOCITY_MS,
  riverLengthKm: DOURO_RIVER_LENGTH_KM,
  basinAreaKm2: DOURO_BASIN_AREA_KM2,
  governance: {
    name: "Albufeira Convention (1998), Spain-Portugal shared river basins",
    note: ALBUFEIRA_CONVENTION_NOTE,
  },
  provenance: [
    { claim: "Douro (897 km) / Duero is the largest Iberian river basin, Spain to the Atlantic at Porto", status: "verified", note: "Confirmed against the river’s own Wikipedia infobox, fetched directly." },
    { claim: "All 4 cross-border station NAMES (Zamora, Barca d’Alva, Peso da Régua, Porto)", status: "verified", note: "Real places, each confirmed to sit directly on or essentially at the Douro/Duero." },
    { claim: "All 4 station coordinates", status: "verified", note: "Fetched directly from each place’s own Wikipedia infobox, not estimated." },
    { claim: "Upstream-to-downstream order (Zamora → Barca d’Alva → Peso da Régua → Porto)", status: "verified", note: "Follows the river’s real, confirmed west-flowing course; longitude decreases monotonically station to station." },
    { claim: "Albufeira Convention (1998, Spain–Portugal shared-basin treaty covering the Douro)", status: "verified", note: "Real bilateral treaty, in force since 2000; confirmed real-time hydrometeorological data-sharing + monthly monitoring provisions. A specific pollution-notification clause could NOT be independently confirmed and is not claimed. See METHODS.md §6b." },
    { claim: "A named hospital for the Douro network", status: "illustrative", note: "No -- no hospital is named outside Coimbra; a clinician card here refers to “your institution’s protocol” rather than inventing one." },
    { claim: "Mean flow velocity (0.5 m/s)", status: "illustrative", note: "No public gauge reading to check against; a documented, tunable default. The small-channel default dispersion coefficient also understates plume spread for a river this size." },
    STRAIGHT_LINE_DISTANCE_ROW,
  ],
};

export const CATCHMENTS: CatchmentDefinition[] = [
  MONDEGO_CATCHMENT,
  DOURO_CATCHMENT,
  TAGUS_CATCHMENT,
  DANUBE_CATCHMENT,
  RHINE_CATCHMENT,
  ELBE_CATCHMENT,
  ODER_CATCHMENT,
];

export const ALL_STATIONS: NetworkStation[] = CATCHMENTS.flatMap((c) => c.stations);

// Station ids key shared registries (telemetry, patient-view lookup), so a
// collision between two rivers would silently cross-wire them -- fail at
// import time instead.
{
  const seen = new Set<string>();
  for (const station of ALL_STATIONS) {
    if (seen.has(station.id)) throw new Error(`Duplicate station id '${station.id}' across catchments`);
    seen.add(station.id);
  }
  const catchmentIds = new Set<string>();
  for (const c of CATCHMENTS) {
    if (catchmentIds.has(c.id)) throw new Error(`Duplicate catchment id '${c.id}'`);
    catchmentIds.add(c.id);
  }
}

export function catchmentById(id: string): CatchmentDefinition | undefined {
  return CATCHMENTS.find((c) => c.id === id);
}

export function catchmentOfStation(stationId: string): CatchmentDefinition | undefined {
  return CATCHMENTS.find((c) => c.stations.some((s) => s.id === stationId));
}

export function stationAnywhere(stationId: string): NetworkStation | undefined {
  return ALL_STATIONS.find((s) => s.id === stationId);
}

/** Mondego keeps the original un-prefixed /demo/* routes (backward
 * compatible with every existing caller); every other river is served
 * under /demo/<id>/*. */
export function routePrefix(catchment: CatchmentDefinition): string {
  return catchment.id === "mondego" ? "/demo" : `/demo/${catchment.id}`;
}

export const COUNTRIES_COVERED: CountryCode[] = [
  ...new Set(ALL_STATIONS.map((s) => s.country).filter((c): c is CountryCode => c !== undefined)),
].sort();
