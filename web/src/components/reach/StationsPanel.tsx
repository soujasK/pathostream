import clsx from 'clsx'
import type { EarlyWarningState, NetworkStation, StationState } from '../../api/types'
import { EwmaSparkline } from './EwmaSparkline'

interface StationsPanelProps {
  stations: NetworkStation[]
  states: StationState[]
  telemetry: EarlyWarningState[]
  onToggleBreach: (stationId: string, flagged: boolean) => void
  onInject: (stationId: string) => void
  onClear: (stationId: string) => void
  onFastForward: (minutes: number) => void
  onReset: () => void
}

// Plume travel time spans minutes (a city reach) to weeks (the Danube), so
// the steps do too.
const FAST_FORWARD_STEPS = [
  { label: '+5m', minutes: 5 },
  { label: '+20m', minutes: 20 },
  { label: '+1h', minutes: 60 },
  { label: '+2.5h', minutes: 150 },
  { label: '+12h', minutes: 720 },
  { label: '+1d', minutes: 1440 },
  { label: '+3d', minutes: 4320 },
  { label: '+7d', minutes: 10080 },
]

type Tone = 'healthy' | 'warning' | 'critical'

const PILL: Record<Tone, string> = {
  healthy: 'border-healthy-border bg-healthy-bg text-healthy',
  warning: 'border-warning-border bg-warning-bg text-warning',
  critical: 'border-critical-border bg-critical-bg text-critical',
}

const DOT: Record<Tone, string> = { healthy: 'bg-healthy', warning: 'bg-warning', critical: 'bg-critical' }

function statusOf(state: StationState | undefined, t: EarlyWarningState | undefined): { label: string; tone: Tone } {
  if (t?.autoEscalated) return { label: 'Escalated', tone: 'critical' }
  if (state?.flagged) {
    return state.confirmedVia === 'statistical-detection'
      ? { label: 'Escalated', tone: 'critical' }
      : { label: 'Confirmed', tone: 'critical' }
  }
  if (t?.latest?.outOfControl) return { label: 'Anomaly', tone: 'warning' }
  return { label: 'Normal', tone: 'healthy' }
}

// Fixed widths so the columns stay aligned when a row's labels change
// ("Inject anomaly" -> "Stop anomaly", "Confirm" -> "Clear").
const BUTTON = 'shrink-0 rounded-md border py-1 text-center text-xs font-medium whitespace-nowrap transition-colors'
const BUTTON_IDLE = 'border-border bg-surface-muted text-ink-muted hover:text-ink'
const BUTTON_ACTIVE = 'border-critical-border bg-critical-bg text-critical'

/** One row per station: live status, the EWMA control chart, and the two
 * test controls -- inject a rising-turbidity anomaly (the detector finds it
 * and auto-escalates), or report confirmed contamination outright. */
export function StationsPanel({
  stations,
  states,
  telemetry,
  onToggleBreach,
  onInject,
  onClear,
  onFastForward,
  onReset,
}: StationsPanelProps) {
  const stateByStation = new Map(states.map((s) => [s.stationId, s]))
  const telemetryByStation = new Map(telemetry.map((t) => [t.stationId, t]))
  const anyFlagged = states.some((s) => s.flagged)

  return (
    <div>
      <div className="divide-y divide-border">
        {stations.map((station) => {
          const state = stateByStation.get(station.id)
          const t = telemetryByStation.get(station.id)
          const flagged = state?.flagged ?? false
          const status = statusOf(state, t)
          return (
            <div key={station.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
              <span className={clsx('h-2 w-2 shrink-0 rounded-full', DOT[status.tone])} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{station.name}</span>
              <span
                className={clsx(
                  'w-[76px] shrink-0 rounded-full border px-2 py-0.5 text-center text-[10px] font-bold tracking-wide uppercase',
                  PILL[status.tone],
                )}
              >
                {status.label}
              </span>
              {/* Own row on phones (so the name isn't squeezed), inline on desktop. */}
              <div className="flex basis-full items-center gap-3 pl-5 sm:basis-auto sm:pl-0">
                <EwmaSparkline history={t?.history ?? []} width={84} height={28} />
                <button
                  type="button"
                  onClick={() => (t?.eventInjected ? onClear(station.id) : onInject(station.id))}
                  title="Test: simulate a rising-turbidity trend here. The EWMA detector notices it and auto-escalates after 5 consecutive out-of-control readings."
                  className={clsx(BUTTON, 'w-[104px]', t?.eventInjected ? BUTTON_ACTIVE : BUTTON_IDLE)}
                >
                  {t?.eventInjected ? 'Stop anomaly' : 'Inject anomaly'}
                </button>
                <button
                  type="button"
                  onClick={() => onToggleBreach(station.id, !flagged)}
                  title="Test: report confirmed contamination at this station right now (ground truth, no detection delay)."
                  className={clsx(BUTTON, 'w-[68px]', flagged ? BUTTON_ACTIVE : BUTTON_IDLE)}
                >
                  {flagged ? 'Clear' : 'Confirm'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
        <span className="mr-1 text-[11px] font-semibold tracking-wide text-ink-faint uppercase">Fast-forward</span>
        {FAST_FORWARD_STEPS.map((step) => (
          <button
            key={step.label}
            type="button"
            onClick={() => onFastForward(step.minutes)}
            disabled={!anyFlagged}
            className="rounded-md border border-border bg-surface-muted px-2 py-1 text-xs font-medium text-ink transition-colors hover:border-brand-300 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {step.label}
          </button>
        ))}
        <button
          type="button"
          onClick={onReset}
          disabled={!anyFlagged}
          className="ml-auto rounded-md border border-border px-2.5 py-1 text-xs font-medium text-ink-muted transition-colors hover:border-brand-300 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          Reset
        </button>
      </div>
    </div>
  )
}
