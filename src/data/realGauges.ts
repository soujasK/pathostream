/**
 * Real, live water-LEVEL readings from Germany's federal gauge network
 * (PEGELONLINE, operated by the Wasserstraßen- und Schifffahrtsverwaltung
 * des Bundes -- WSV), matched to 5 of this project's existing German
 * stations by proximity (each match's straight-line distance from our
 * already-published station coordinates is asserted in
 * test/realGauges.test.ts; every match is within ~2.1 km, i.e. the same
 * reach of the same river).
 *
 * READ THIS BEFORE CHANGING ANYTHING ELSE IN THIS FILE:
 *
 * This is real water LEVEL (river stage, in cm), not turbidity, and it
 * does NOT feed the contamination detector (analytics/ewma.ts still runs
 * on synthetic telemetry for every station, this one included). It is
 * shown to a viewer purely as "here is a live number from a real
 * government API, for context" -- see `src/cdsHooks/realGaugeRoutes.ts`
 * and the UI badge that renders it, both of which are careful never to
 * present it as if it were the detection signal. Conflating "we have one
 * real external number" with "the contamination detection is real" would
 * be exactly the kind of false claim this project's disclosure policy
 * exists to prevent -- see METHODS.md and the "verified vs illustrative"
 * table in README.md.
 *
 * No match was found for DE-COLOGNE (queried the PEGELONLINE REST API for
 * every RHEIN station on 2026-09-22; none named Köln/Cologne exists in
 * the federal network) -- left out rather than approximated to a nearby
 * but different station.
 *
 * Source: https://www.pegelonline.wsv.de/webservice/dokuRestapi (REST API
 * v2, no authentication required); data licensed DL-DE->Zero-2.0 (free
 * reuse, no attribution legally required, no warranty of accuracy).
 */

export interface RealGaugeMatch {
  /** This project's station id (data/*Network.ts). */
  stationId: string;
  /** PEGELONLINE's station UUID. */
  pegelonlineUuid: string;
  /** PEGELONLINE's own name for the station. */
  gaugeName: string;
  /** PEGELONLINE's own coordinates for the gauge, fetched directly --
   * kept alongside our station's coordinates so the match's real-world
   * distance is auditable, not just asserted. */
  gaugeLatitude: number;
  gaugeLongitude: number;
}

export const REAL_GAUGE_MATCHES: RealGaugeMatch[] = [
  {
    stationId: "DE-MAINZ",
    pegelonlineUuid: "a37a9aa3-45e9-4d90-9df6-109f3a28a5af",
    gaugeName: "MAINZ",
    gaugeLatitude: 50.003995,
    gaugeLongitude: 8.275319,
  },
  {
    stationId: "DE-DRESDEN",
    pegelonlineUuid: "70272185-b2b3-4178-96b8-43bea330dcae",
    gaugeName: "DRESDEN",
    gaugeLatitude: 51.05446,
    gaugeLongitude: 13.738832,
  },
  {
    stationId: "DE-MAGDEBURG",
    pegelonlineUuid: "ccccb57f-a2f9-4183-ae88-5710d3afaefd",
    gaugeName: "MAGDEBURG-STROMBRÜCKE",
    gaugeLatitude: 52.129698,
    gaugeLongitude: 11.644334,
  },
  {
    stationId: "DE-HAMBURG",
    pegelonlineUuid: "d488c5cc-4de9-4631-8ce1-0db0e700b546",
    gaugeName: "HAMBURG ST. PAULI",
    gaugeLatitude: 53.545442,
    gaugeLongitude: 9.969965,
  },
  {
    stationId: "DE-FRANKFURT-ODER",
    pegelonlineUuid: "bffdf7f2-6200-42a2-a4bc-a8111e27e043",
    gaugeName: "FRANKFURT1 (ODER)",
    gaugeLatitude: 52.357806,
    gaugeLongitude: 14.551732,
  },
];

export function realGaugeForStation(stationId: string): RealGaugeMatch | undefined {
  return REAL_GAUGE_MATCHES.find((m) => m.stationId === stationId);
}
