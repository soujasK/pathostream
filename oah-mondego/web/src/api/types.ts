// Mirrors the TypeScript types in oah-mondego/src/cdsHooks/*.ts,
// oah-mondego/src/data/mondegoNetwork.ts and
// oah-mondego/src/hydrology/*.ts. Kept in sync by hand.

export interface NetworkStation {
  id: string
  name: string
  latitude: number
  longitude: number
  verified: boolean
  coordinatesEstimated?: boolean
  verificationNote: string
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
