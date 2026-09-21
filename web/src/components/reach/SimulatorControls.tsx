import clsx from 'clsx'
import type { NetworkStation, StationState } from '../../api/types'

interface SimulatorControlsProps {
  stations: NetworkStation[]
  states: StationState[]
  onToggleBreach: (stationId: string, flagged: boolean) => void
  onFastForward: (elapsedMinutes: number) => void
  onReset: () => void
}

const FAST_FORWARD_STEPS = [
  { label: '+5 min', minutes: 5 },
  { label: '+20 min', minutes: 20 },
  { label: '+60 min', minutes: 60 },
  { label: '+150 min', minutes: 150 },
]

export function SimulatorControls({ stations, states, onToggleBreach, onFastForward, onReset }: SimulatorControlsProps) {
  const stateByStation = new Map(states.map((s) => [s.stationId, s]))
  const anyFlagged = states.some((s) => s.flagged)

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-muted">
        Testing tool: reports a station's sensor as having just CONFIRMED contamination outright -- ground truth,
        announced instantly, no detection delay. This is what drives the map, the downstream forecast, and the
        Emergency Department's CDS Hooks alert. (The "Statistical early-warning layer" below reaches this same
        confirmed state a different way: it *detects* a developing anomaly and auto-escalates it after a sustained
        run -- no manual report needed.)
      </p>
      <div className="divide-y divide-border">
        {stations.map((station) => {
          const state = stateByStation.get(station.id)
          const flagged = state?.flagged ?? false
          return (
            <div key={station.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <span className={clsx('h-2 w-2 rounded-full', flagged ? 'bg-critical' : 'bg-healthy')} />
                <span className="text-sm font-medium text-ink">{station.name}</span>
              </div>
              <button
                type="button"
                onClick={() => onToggleBreach(station.id, !flagged)}
                title="Testing tool: mark this station as having confirmed contamination right now"
                className={clsx(
                  'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                  flagged
                    ? 'border-critical-border bg-critical-bg text-critical'
                    : 'border-border bg-surface-muted text-ink-muted hover:text-ink',
                )}
              >
                {flagged ? 'Confirmed — clear it' : 'Test: report confirmed contamination'}
              </button>
            </div>
          )
        })}
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">
          Fast-forward the simulated clock
        </div>
        <p className="mb-2 text-xs text-ink-muted">
          Sets WHEN we're looking, not the physics -- lets the farthest station's ~2.5hr predicted window be seen
          without waiting it out live.
        </p>
        <div className="grid grid-cols-4 gap-2">
          {FAST_FORWARD_STEPS.map((step) => (
            <button
              key={step.label}
              type="button"
              onClick={() => onFastForward(step.minutes)}
              disabled={!anyFlagged}
              className="rounded-lg border border-border bg-surface-muted px-2 py-2 text-xs font-medium text-ink transition-colors hover:border-brand-300 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {step.label}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onReset}
        disabled={!anyFlagged}
        className="w-full rounded-lg border border-border px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:border-brand-300 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
      >
        Reset -- clear all stations
      </button>
    </div>
  )
}
