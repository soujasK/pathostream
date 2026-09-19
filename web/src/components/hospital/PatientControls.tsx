import clsx from 'clsx'
import type { StationInfo, StationReading } from '../../api/types'
import { Toggle } from '../ui/Toggle'

interface PatientControlsProps {
  stations: StationInfo[]
  readingByStation: Map<string, StationReading>
  selectedStationId: string | undefined
  onSelectStation: (stationId: string) => void
  betaLactamAllergy: boolean
  onBetaLactamAllergyChange: (value: boolean) => void
  renalImpairment: boolean
  onRenalImpairmentChange: (value: boolean) => void
}

export function PatientControls({
  stations,
  readingByStation,
  selectedStationId,
  onSelectStation,
  betaLactamAllergy,
  onBetaLactamAllergyChange,
  renalImpairment,
  onRenalImpairmentChange,
}: PatientControlsProps) {
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">
          Patient&rsquo;s home address (nearest station)
        </div>
        <div className="flex flex-wrap gap-1.5">
          {stations.map((station) => {
            const flagged = readingByStation.get(station.station_id)?.biohazard_flag_active ?? false
            const selected = station.station_id === selectedStationId
            return (
              <button
                key={station.station_id}
                type="button"
                onClick={() => onSelectStation(station.station_id)}
                className={clsx(
                  'relative rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  selected
                    ? 'border-brand-700 bg-brand-700 text-white'
                    : 'border-border bg-surface-muted text-ink-muted hover:border-brand-300 hover:text-ink',
                )}
              >
                {station.station_id}
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

      <div className="divide-y divide-border border-t border-border pt-1">
        <Toggle
          label="Severe penicillin / beta-lactam allergy"
          description="Routes empiric therapy to the alternative regimen"
          checked={betaLactamAllergy}
          onChange={onBetaLactamAllergyChange}
        />
        <Toggle
          label="Chronic kidney disease on file"
          description="Flagged for renal dosing review"
          checked={renalImpairment}
          onChange={onRenalImpairmentChange}
        />
      </div>
    </div>
  )
}
