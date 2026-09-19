import type { NetworkForecast, NetworkStation } from '../../api/types'

interface ForecastPanelProps {
  forecasts: NetworkForecast[]
  stations: NetworkStation[]
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`
  return `${(minutes / 60).toFixed(1)} hr`
}

function nameOf(stations: NetworkStation[], id: string): string {
  return stations.find((s) => s.id === id)?.name ?? id
}

/** Every currently-active downstream forecast across the network --
 * computed by app/hydrology/propagation.ts's flow-order cascade, the same
 * pattern as the sibling Mithi dashboard's "Predicted downstream impact"
 * panel. */
export function ForecastPanel({ forecasts, stations }: ForecastPanelProps) {
  if (forecasts.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-muted">No downstream contamination currently predicted.</p>
  }

  return (
    <div className="space-y-2.5">
      {forecasts.map((forecast) => (
        <div
          key={`${forecast.sourceStationId}-${forecast.targetStationId}`}
          className="flex items-center justify-between rounded-lg border border-warning-border bg-warning-bg px-4 py-3"
        >
          <div>
            <div className="text-sm font-semibold text-ink">
              {nameOf(stations, forecast.sourceStationId)} &rarr; {nameOf(stations, forecast.targetStationId)}
            </div>
            <div className="text-xs text-ink-muted">{forecast.transport.distanceKm.toFixed(2)} km downstream</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold tabular-nums text-warning">
              {formatMinutes(forecast.transport.peakTimeMinutes)}
            </div>
            <div className="text-[10px] font-semibold tracking-wide text-ink-faint uppercase">peak ETA</div>
          </div>
        </div>
      ))}
    </div>
  )
}
