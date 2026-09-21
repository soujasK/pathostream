import { useQueries, useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type {
  CatchmentInfo,
  NetworkForecast,
  NetworkStation,
  StationEvaluation,
  StationState,
} from '../api/types'

const POLL_INTERVAL_MS = 3000

// Stable references so a not-yet-loaded river doesn't hand every consumer
// a brand-new [] on each render.
const NO_STATIONS: NetworkStation[] = []
const NO_STATES: StationState[] = []
const NO_EVALUATIONS: StationEvaluation[] = []
const NO_FORECASTS: NetworkForecast[] = []

export interface CatchmentData {
  info: CatchmentInfo
  stations: NetworkStation[]
  stationStates: StationState[]
  evaluations: StationEvaluation[]
  forecasts: NetworkForecast[]
}

/** The list of rivers, straight from the backend registry -- the
 * dashboard has no river hard-coded, so a new river appears everywhere
 * (switcher, Europe map, disclosure panel) the moment it's registered. */
export function useCatchmentRegistry() {
  const query = useQuery({ queryKey: ['catchments'], queryFn: api.catchments, staleTime: Infinity })
  return {
    catchments: query.data?.catchments ?? [],
    countriesCovered: query.data?.countriesCovered ?? [],
    isLoading: query.isLoading,
  }
}

/** Every river's stations, exposure state and forecasts, polled together
 * so the Europe map, the Incident Timeline and the river switcher all see
 * every river at once -- not just the one currently on screen. */
export function useAllCatchmentData(catchments: CatchmentInfo[]): Record<string, CatchmentData> {
  const results = useQueries({
    queries: catchments.flatMap((c) => [
      { queryKey: ['stations', c.id], queryFn: () => api.stations(c.id), staleTime: Infinity },
      { queryKey: ['state', c.id], queryFn: () => api.state(c.id), refetchInterval: POLL_INTERVAL_MS },
      { queryKey: ['forecasts', c.id], queryFn: () => api.forecasts(c.id), refetchInterval: POLL_INTERVAL_MS },
    ]),
  })

  const data: Record<string, CatchmentData> = {}
  catchments.forEach((info, i) => {
    const stationsResult = results[i * 3]
    const stateResult = results[i * 3 + 1]
    const forecastsResult = results[i * 3 + 2]
    data[info.id] = {
      info,
      stations: (stationsResult?.data as NetworkStation[] | undefined) ?? NO_STATIONS,
      stationStates: (stateResult?.data as { stations: StationState[] } | undefined)?.stations ?? NO_STATES,
      evaluations: (stateResult?.data as { evaluations: StationEvaluation[] } | undefined)?.evaluations ?? NO_EVALUATIONS,
      forecasts: (forecastsResult?.data as { forecasts: NetworkForecast[] } | undefined)?.forecasts ?? NO_FORECASTS,
    }
  })
  return data
}
