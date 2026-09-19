// Mirrors the Pydantic response models in app/main.py and app/models/cds_hooks.py.
// Keep these in sync by hand -- there is no shared schema generation step (yet).

export interface DemoConfig {
  cci_biohazard_threshold: number
}

export interface StationInfo {
  station_id: string
  latitude: number
  longitude: number
}

export interface StationReading {
  station_id: string
  latitude: number
  longitude: number
  cci: number
  biohazard_flag_active: boolean
  rationale: string
  observed_at: string
}

export interface HistoryPoint {
  tick: number
  station_id: string
  cci: number
  biohazard_flag_active: boolean
  observed_at: string
}

export interface ForecastEntry {
  source_station_id: string
  target_station_id: string
  distance_km: number
  eta_minutes: number
  probability: number
}

export interface DemoTickResponse {
  catchment_id: string
  tick: number
  stations: StationReading[]
  history: HistoryPoint[]
  forecast: ForecastEntry[]
}

export type CdsIndicator = 'info' | 'warning' | 'critical'

export interface CardSource {
  label: string
  url: string | null
  icon: string | null
}

export interface SuggestionAction {
  type: 'create' | 'update' | 'delete'
  description: string
  resource: Record<string, unknown> | null
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

export interface CatchmentBoundary {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    properties: Record<string, unknown>
    geometry: {
      type: string
      coordinates: unknown
    }
  }>
}
