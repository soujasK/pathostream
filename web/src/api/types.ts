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

/** GET /real-gauge/:stationId -- a live reading from a real government API
 * (Germany's PEGELONLINE), when this station has one. Water LEVEL only;
 * unrelated to and never feeds the (still-synthetic) contamination
 * detector -- see src/data/realGauges.ts. */
export type RealGaugeResponse =
  | {
      available: true
      stationId: string
      gaugeName: string
      waterLevelCm: number
      stateMnwMhw: string | null
      measuredAt: string
      fetchedAt: string
      source: string
      licence: string
    }
  | { available: false; reason: 'no-match' | 'fetch-failed'; detail?: string }

/** citizen/features.ts -- a structured water/habitat report, modelled on
 * the real OneAquaHealth Citizen Science App's own observation categories
 * (photos/video are not modelled here -- see METHODS.md section 6d). */
export interface ObservationInput {
  clarityScore: 1 | 2 | 3 | 4 | 5
  unusualOdor: boolean
  deadWildlife: boolean
  discoloration: boolean
  foam: boolean
}

export interface FeatureContribution {
  feature: string
  value: number
  weight: number
  contribution: number
}

/** citizen/classifier.ts's output: a real, trained, explainable logistic
 * regression -- never auto-confirms anything, only ever recommends a
 * human reviewer take a look. */
export interface TriageResult {
  probability: number
  recommendReview: boolean
  threshold: number
  explanation: { bias: number; contributions: FeatureContribution[]; logit: number }
  modelInfo: { trainedOn: number; heldOutAccuracy: number; seed: number }
}

export type ObservationStatus = 'pending' | 'promoted' | 'dismissed'

export interface CitizenObservation {
  id: string
  stationId: string
  catchmentId: string
  submittedAt: string
  input: ObservationInput
  note: string | null
  triage: TriageResult
  status: ObservationStatus
  reviewedAt: string | null
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
  /** Sensitivity of the peak ETA to the placeholder velocity -- an assumed
   * range, not a calibrated prediction interval (src/hydrology/uncertainty.ts). */
  peakBand: { lowMinutes: number; highMinutes: number; velocityLogSd: number }
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
