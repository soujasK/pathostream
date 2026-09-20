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
  /** Present only on the cross-border Douro network's stations. */
  country?: 'ES' | 'PT'
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

export interface StationEvaluation {
  stationId: string
  phase: ExposurePhase
  isOwnFlag: boolean
  sourceStationId: string
  wfd: WfdClassification
  elapsedMinutes: number
  probability: number
  forecast?: TransportForecast
}

export interface StationState {
  stationId: string
  flagged: boolean
  severityIndex: number
  flaggedAt: string | null
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
