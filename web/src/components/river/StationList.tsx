import clsx from 'clsx'
import type { StationInfo, StationReading } from '../../api/types'

interface StationListProps {
  stations: StationInfo[]
  readingByStation: Map<string, StationReading>
  breached: Set<string>
  onToggleBreach: (stationId: string) => void
}

/** The simulator controls: one row per demo station, a live status dot, its
 * current CCI, and a switch to inject an acute sewage-backflow reading on
 * the next tick. All values here come from the real `/demo/tick` response
 * -- nothing is fabricated in the browser. */
export function StationList({ stations, readingByStation, breached, onToggleBreach }: StationListProps) {
  return (
    <div className="divide-y divide-border">
      {stations.map((station) => {
        const reading = readingByStation.get(station.station_id)
        const flagged = reading?.biohazard_flag_active ?? false
        const willBreach = breached.has(station.station_id)
        return (
          <div key={station.station_id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <span
                className={clsx('h-2 w-2 rounded-full', flagged ? 'bg-critical' : 'bg-healthy')}
                aria-hidden="true"
              />
              <div>
                <div className="text-sm font-medium text-ink">{station.station_id}</div>
                <div className="text-xs text-ink-muted tabular-nums">
                  {reading ? `CCI ${reading.cci.toFixed(1)}` : 'awaiting reading'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onToggleBreach(station.station_id)}
              className={clsx(
                'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                willBreach
                  ? 'border-critical-border bg-critical-bg text-critical'
                  : 'border-border bg-surface-muted text-ink-muted hover:text-ink',
              )}
            >
              {willBreach ? 'Simulating breach' : 'Simulate breach'}
            </button>
          </div>
        )
      })}
    </div>
  )
}
