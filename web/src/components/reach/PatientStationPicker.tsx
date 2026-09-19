import clsx from 'clsx'
import type { NetworkStation, StationEvaluation } from '../../api/types'

interface PatientStationPickerProps {
  stations: NetworkStation[]
  evaluations: StationEvaluation[]
  selectedStationId: string | undefined
  onSelectStation: (stationId: string) => void
}

export function PatientStationPicker({ stations, evaluations, selectedStationId, onSelectStation }: PatientStationPickerProps) {
  const evaluationByStation = new Map(evaluations.map((e) => [e.stationId, e]))

  return (
    <div>
      <div className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">
        Patient&rsquo;s home address (nearest station)
      </div>
      <div className="flex flex-wrap gap-1.5">
        {stations.map((station) => {
          const evaluation = evaluationByStation.get(station.id)
          const flagged = evaluation !== undefined
          const selected = station.id === selectedStationId
          return (
            <button
              key={station.id}
              type="button"
              onClick={() => onSelectStation(station.id)}
              className={clsx(
                'relative rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                selected
                  ? 'border-brand-700 bg-brand-700 text-white'
                  : 'border-border bg-surface-muted text-ink-muted hover:border-brand-300 hover:text-ink',
              )}
            >
              {station.name}
              {flagged && (
                <span
                  className={clsx(
                    'absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ring-2',
                    selected ? 'bg-white ring-brand-700' : 'bg-critical ring-surface-muted',
                  )}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
