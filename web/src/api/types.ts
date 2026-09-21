// Mirrors the TypeScript types in ../src/cdsHooks/*.ts,
// ../src/data/mondegoNetwork.ts, ../src/data/douroNetwork.ts and
// ../src/hydrology/*.ts. Kept in sync by hand.

export interface NetworkStation {
  id: string
  name: string
  latitude: number
  longitude: number
  verified: boolean
  coordinatesEstimated?: boolean
  verificationNote: string
  /** ISO 3166-1 alpha-2 code of the EU member state the station is in. */
  country?: string
}

export interface ProvenanceRow {
  claim: string
  status: 'verified' | 'illustrative'
  note: string
}

/** One river network, as described by GET /demo/catchments. */
export interface CatchmentInfo {
  id: string
  label: string
  region: string
  stationCount: number
  countries: string[]
  riverLengthKm: number | null
  basinAreaKm2: number | null
  meanVelocityMs: number
  governance: { name: string; note: string } | null
  hospitalAnchor: string | null
  provenance: ProvenanceRow[]
}

export interface CatchmentsResponse {
  countriesCovered: string[]
  catchments: CatchmentInfo[]
}

export interface TransportForecast {
  distanceKm: number
  peakTimeMinutes: number
  arrivalTimeMinutes: number
  clearanceTimeMinutes: number
  temporalSpreadMinutes: number
  dispersionCoefficientM2S: number
}

export type WfdEcologicalStatusClass = 'High' | 'Good' | 'Moderate' | 'Poor' | 'Bad'

export interface WfdClassification {
  eqrClass: WfdEcologicalStatusClass
  indicativeEqr: number
  note: string
}

export type ExposurePhase = 'predicted' | 'confirmed' | 'cleared'

/** 'operator' = a human reported it via the demo's testing controls;
 * 'statistical-detection' = the EWMA early-warning layer auto-escalated
 * it after a sustained anomaly (src/analytics/earlyWarningEngine.ts). */
export type ConfirmationSource = 'operator' | 'statistical-detection'

export interface StationEvaluation {
  stationId: string
  phase: ExposurePhase
  isOwnFlag: boolean
  sourceStationId: string
  wfd: WfdClassification
  elapsedMinutes: number
  probability: number
  forecast?: TransportForecast
  confirmedVia?: ConfirmationSource
}

export interface StationState {
  stationId: string
  flagged: boolean
  severityIndex: number
  flaggedAt: string | null
  confirmedVia: ConfirmationSource
}

export interface DemoStateResponse {
  catchmentId: string
  stations: StationState[]
  evaluations: StationEvaluation[]
}

export interface NetworkForecast {
  sourceStationId: string
  targetStationId: string
  transport: TransportForecast
}

export interface DemoForecastsResponse {
  catchmentId: string
  forecasts: NetworkForecast[]
}

export interface EwmaResult {
  tick: number
  sample: number
  z: number
  upperControlLimit: number
  lowerControlLimit: number
  outOfControl: boolean
}

export interface EarlyWarningState {
  stationId: string
  tick: number
  eventInjected: boolean
  latest: EwmaResult | null
  history: EwmaResult[]
  autoEscalated: boolean
}

export interface DemoTelemetryResponse {
  catchmentId: string
  stations: EarlyWarningState[]
}

export type CdsIndicator = 'info' | 'warning' | 'critical'

export interface CardSource {
  label: string
  url?: string
  icon?: string
}

export interface SuggestionAction {
  type: 'create' | 'update' | 'delete'
  description: string
  resource?: Record<string, unknown>
}

export interface Suggestion {
  label: string
  uuid: string
  actions: SuggestionAction[]
}

export interface Card {
  uuid: string
  summary: string
  indicator: CdsIndicator
  detail: string
  source: CardSource
  suggestions: Suggestion[]
}

export interface CdsHookResponse {
  cards: Card[]
}
