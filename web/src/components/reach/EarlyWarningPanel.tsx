import clsx from 'clsx'
import type { EarlyWarningState, EwmaResult, NetworkStation } from '../../api/types'
import { EwmaSparkline } from './EwmaSparkline'

interface EarlyWarningPanelProps {
  stations: NetworkStation[]
  telemetry: EarlyWarningState[]
  onInject: (stationId: string) => void
  onClear: (stationId: string) => void
}

function consecutiveOutOfControl(history: EwmaResult[]): number {
  let count = 0
  for (let i = history.length - 1; i >= 0; i--) {
    if (!history[i]!.outOfControl) break
    count += 1
  }
  return count
}

/** Translates the raw EWMA output into a sentence a non-statistician can
 * act on -- the technical numbers stay visible underneath for anyone who
 * wants them, but they are no longer the FIRST thing a reader has to
 * parse. */
function plainLanguageStatus(t: EarlyWarningState | undefined): string {
  if (!t?.latest) return 'Waiting for the first sensor reading.'
  if (!t.latest.outOfControl) return 'Turbidity is stable, within its normal statistical range.'
  const ticks = consecutiveOutOfControl(t.history)
  return `Turbidity has been trending above normal for ${ticks} consecutive reading${ticks === 1 ? '' : 's'} -- flagged as an early contamination signal, before any hard threshold is crossed.`
}

export function EarlyWarningPanel({ stations, telemetry, onInject, onClear }: EarlyWarningPanelProps) {
  const byStation = new Map(telemetry.map((t) => [t.stationId, t]))

  return (
    <div className="space-y-1">
      <p className="mb-3 text-xs text-ink-muted">
        A real EWMA (exponentially weighted moving average) control chart independently monitors each station's raw,
        noisy turbidity signal, tick by tick -- a genuine statistical early-warning layer, sensitive to a sustained
        drift a single-sample threshold would miss. It runs independently of, and is not fused with, the confirmed-
        breach reporting in "Water Authority Operations" above. See METHODS.md &sect;8.
      </p>
      <div className="divide-y divide-border">
        {stations.map((station) => {
          const t = byStation.get(station.id)
          const outOfControl = t?.latest?.outOfControl ?? false
          return (
            <div key={station.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink">{station.name}</span>
                  <span
                    className={clsx(
                      'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase',
                      outOfControl
                        ? 'border-critical-border bg-critical-bg text-critical'
                        : 'border-healthy-border bg-healthy-bg text-healthy',
                    )}
                  >
                    {outOfControl ? 'Anomaly detected' : 'In control'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-muted">{plainLanguageStatus(t)}</p>
                <div className="mt-0.5 text-[11px] text-ink-faint">
                  {t?.latest ? `tick ${t.tick} · sample ${t.latest.sample.toFixed(1)} NTU · z=${t.latest.z.toFixed(1)}` : ' '}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <EwmaSparkline history={t?.history ?? []} width={160} height={44} />
                <button
                  type="button"
                  onClick={() => (t?.eventInjected ? onClear(station.id) : onInject(station.id))}
                  title={
                    t?.eventInjected
                      ? 'Stop the simulated rising-turbidity trend at this station'
                      : 'Testing tool: start a slow, realistic rising-turbidity trend here to watch the detector notice it a few ticks later'
                  }
                  className={clsx(
                    'shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors',
                    t?.eventInjected
                      ? 'border-critical-border bg-critical-bg text-critical'
                      : 'border-border bg-surface-muted text-ink-muted hover:text-ink',
                  )}
                >
                  {t?.eventInjected ? 'Stop test' : 'Test: simulate rising turbidity'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
