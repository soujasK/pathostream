import clsx from 'clsx'
import type { NetworkStation, StationEvaluation } from '../../api/types'

export interface PatientPickerGroup {
  id: string
  label: string
  stations: NetworkStation[]
  evaluations: StationEvaluation[]
}

interface PatientStationPickerProps {
  groups: PatientPickerGroup[]
  selectedStationId: string | undefined
  onSelectStation: (stationId: string) => void
}

/** Choose any monitored station, on any river, as the patient's home
 * address (its nearest station). Grouped by river. */
export function PatientStationPicker({ groups, selectedStationId, onSelectStation }: PatientStationPickerProps) {
  return (
    <div className="space-y-4">
      <div className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
        Patient&rsquo;s home address (nearest station)
      </div>
      {groups.map((group) => {
        const evaluationByStation = new Map(group.evaluations.map((e) => [e.stationId, e]))
        return (
          <div key={group.id}>
            <div className="mb-1.5 text-[11px] font-semibold tracking-wider text-ink-faint uppercase">{group.label}</div>
            <div className="flex flex-wrap gap-1.5">
              {group.stations.map((station) => {
                const flagged = evaluationByStation.has(station.id)
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
      })}
    </div>
  )
}
