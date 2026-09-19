/**
 * The Mondego River case-study reach (Coimbra, Portugal).
 *
 * PROVENANCE -- read before trusting any number here:
 *  - `PARQUE_VERDE_DO_MONDEGO` is a real, independently confirmed park on
 *    the Mondego in Coimbra (public sources: Camara Municipal de Coimbra,
 *    Tripadvisor listings).
 *  - `PONTE_DA_PORTELA` could NOT be independently confirmed against public
 *    sources at build time. It is used here as supplied by the project
 *    brief. Before any real use, verify this location against an official
 *    Agencia Portuguesa do Ambiente (APA) / INAG hydrological survey or
 *    OpenStreetMap, the same way `app/data/mithi_catchment.geojson` in the
 *    sibling Python service is flagged as an unsurveyed, illustrative
 *    corridor rather than an official catchment boundary.
 *  - `distanceKm` and `meanVelocityMs` are supplied by the project brief,
 *    not sourced from a real APA/SNIRH river-gauge reading. They are
 *    tunable, documented illustrative defaults -- exactly like
 *    `PROPAGATION_FLOW_VELOCITY_M_S` in the sibling Python service's
 *    `app/core/propagation_engine.py`. Replace with real discharge/gauge
 *    data before treating any forecast here as operationally meaningful.
 */
export interface ReachStation {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    verified: boolean;
    verificationNote: string;
}
export declare const PONTE_DA_PORTELA: ReachStation;
export declare const PARQUE_VERDE_DO_MONDEGO: ReachStation;
export interface ReachDefinition {
    catchmentId: string;
    name: string;
    upstream: ReachStation;
    downstream: ReachStation;
    /** Supplied by the project brief, NOT a verified survey distance. */
    distanceKm: number;
    /** Supplied by the project brief, NOT a verified gauge reading. */
    meanVelocityMs: number;
}
export declare const MONDEGO_REACH: ReachDefinition;
