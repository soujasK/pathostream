import type { ForecastEntry } from '../../api/types'

interface ForecastPanelProps {
  forecasts: ForecastEntry[]
}

function formatEta(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`
  return `${(minutes / 60).toFixed(1)} hr`
}

/** Surfaces app/core/propagation_engine.py's downstream-arrival forecasts:
 * the resilience/early-warning payoff -- contamination predicted before any
 * downstream sensor has actually confirmed it. */
export function ForecastPanel({ forecasts }: ForecastPanelProps) {
  if (forecasts.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-muted">No downstream contamination currently predicted.</p>
  }

  return (
    <div className="space-y-2.5">
      {forecasts.map((forecast) => (
        <div
          key={`${forecast.source_station_id}-${forecast.target_station_id}`}
          className="flex items-center justify-between rounded-lg border border-warning-border bg-warning-bg px-4 py-3"
        >
          <div>
            <div className="text-sm font-semibold text-ink">
              {forecast.source_station_id} &rarr; {forecast.target_station_id}
            </div>
            <div className="text-xs text-ink-muted">
              {forecast.distance_km.toFixed(1)} km downstream &middot; {Math.round(forecast.probability * 100)}%
              modeled probability
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold tabular-nums text-warning">{formatEta(forecast.eta_minutes)}</div>
            <div className="text-[10px] font-semibold tracking-wide text-ink-faint uppercase">predicted ETA</div>
          </div>
        </div>
      ))}
    </div>
  )
}
