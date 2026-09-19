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
export const PONTE_DA_PORTELA = {
    id: "PT-PONTE-PORTELA",
    name: "Ponte da Portela",
    latitude: 40.1982,
    longitude: -8.4015,
    verified: false,
    verificationNote: "Could not be independently confirmed against public sources (web search, OSM) at build time. Supplied by the project brief -- verify against an APA/INAG survey before real use.",
};
export const PARQUE_VERDE_DO_MONDEGO = {
    id: "PT-PARQUE-VERDE",
    name: "Parque Verde do Mondego",
    latitude: 40.2038,
    longitude: -8.4285,
    verified: true,
    verificationNote: "Confirmed real, well-documented park on the Mondego in Coimbra (Camara Municipal de Coimbra; public listings).",
};
export const MONDEGO_REACH = {
    catchmentId: "mondego-coimbra",
    name: "Mondego River, Coimbra (Ponte da Portela to Parque Verde do Mondego)",
    upstream: PONTE_DA_PORTELA,
    downstream: PARQUE_VERDE_DO_MONDEGO,
    distanceKm: 3.85,
    meanVelocityMs: 0.36,
};
