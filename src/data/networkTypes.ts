/**
 * Shared shapes for every river network in the registry
 * (`catchments.ts`). Kept in one place so a new river is a data file, not
 * a copy of another river's routes, engine and UI wiring.
 */

/** EU member states with at least one station in some network. */
export type CountryCode =
  | "PT"
  | "ES"
  | "FR"
  | "DE"
  | "NL"
  | "BE"
  | "AT"
  | "SK"
  | "HU"
  | "HR"
  | "SI"
  | "BG"
  | "RO"
  | "CZ"
  | "PL";

export interface NetworkStation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  verified: boolean;
  coordinatesEstimated?: boolean;
  verificationNote: string;
  country?: CountryCode;
}

/** One line of the "what's verified vs illustrative" disclosure -- lives
 * with the river's data so the dashboard renders it for every river
 * without per-river UI code. */
export interface ProvenanceRow {
  claim: string;
  status: "verified" | "illustrative";
  note: string;
}

/** A real international body/instrument for a river, and ONLY what was
 * independently confirmed about it. */
export interface Governance {
  name: string;
  note: string;
}

export interface CatchmentDefinition {
  /** URL slug. "mondego" keeps the original un-prefixed /demo/* routes for
   * backward compatibility; every other river is served under
   * /demo/<id>/*. */
  id: string;
  /** Internal catchment id used in API payloads (kept stable for the two
   * networks that predate the registry). */
  catchmentId: string;
  label: string;
  /** Human-readable course, e.g. "Spain -> Portugal". */
  region: string;
  stations: NetworkStation[];
  /** Upstream-to-downstream station ids. */
  flowOrder: string[];
  /** Illustrative network-wide mean velocity -- see each river's data file
   * for why it is not calibrated. */
  meanVelocityMs: number;
  riverLengthKm?: number;
  basinAreaKm2?: number;
  governance?: Governance;
  /** Only set where a real hospital is used as narrative framing (Coimbra's
   * CHUC). Elsewhere the clinician card refers to "your institution's
   * protocol" rather than inventing a hospital. */
  hospitalAnchor?: string;
  provenance: ProvenanceRow[];
}

/** Placeholder mean velocity for the large rivers added after Mondego and
 * Douro. NOT verified against any gauge for any of them -- a single
 * order-of-magnitude default, deliberately not differentiated river by
 * river (differing numbers would imply knowledge that isn't here). */
export const ILLUSTRATIVE_LARGE_RIVER_VELOCITY_MS = 1.0;

/** Shared disclosure rows appended to every added river. */
export const STRAIGHT_LINE_DISTANCE_ROW: ProvenanceRow = {
  claim: "Distances between stations",
  status: "illustrative",
  note: "Straight-line (haversine) between consecutive stations' coordinates -- always shorter than the real river path, so predicted arrival times are optimistic (too early).",
};

export const VELOCITY_ROW: ProvenanceRow = {
  claim: `Mean flow velocity (${ILLUSTRATIVE_LARGE_RIVER_VELOCITY_MS} m/s) and dispersion coefficient`,
  status: "illustrative",
  note: "One order-of-magnitude placeholder for a large river, not verified against any gauge; the default dispersion coefficient is a small-channel value, so plume spread is understated for a river this size.",
};
