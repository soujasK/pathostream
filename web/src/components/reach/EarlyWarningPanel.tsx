import clsx from 'clsx'
import type { EarlyWarningState, NetworkStation } from '../../api/types'
import { EwmaSparkline } from './EwmaSparkline'

interface EarlyWarningPanelProps {
  stations: NetworkStation[]
  telemetry: EarlyWarningState[]
  onInject: (stationId: string) => void
  onClear: (stationId: string) => void
}

export function EarlyWarningPanel({ stations, telemetry, onInject, onClear }: EarlyWarningPanelProps) {
  const byStation = new Map(telemetry.map((t) => [t.stationId, t]))

  return (
    <div className="space-y-1">
      <p className="mb-3 text-xs text-ink-muted">
        A real EWMA (exponentially weighted moving average) control chart independently monitors each station's raw,
        noisy turbidity signal, tick by tick -- not the same as, and not fused with, the "Simulate breach" panel
        above. This is a genuine statistical early-warning layer, sensitive to a sustained drift a single-sample
        threshold would miss. See METHODS.md &sect;8.
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
                <div className="mt-1 text-xs text-ink-faint">
                  {t?.latest ? `tick ${t.tick} · sample ${t.latest.sample.toFixed(1)} NTU · z=${t.latest.z.toFixed(1)}` : 'no samples yet'}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <EwmaSparkline history={t?.history ?? []} width={160} height={44} />
                <button
                  type="button"
                  onClick={() => (t?.eventInjected ? onClear(station.id) : onInject(station.id))}
                  className={clsx(
                    'shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors',
                    t?.eventInjected
                      ? 'border-critical-border bg-critical-bg text-critical'
                      : 'border-border bg-surface-muted text-ink-muted hover:text-ink',
                  )}
                >
                  {t?.eventInjected ? 'Clear event' : 'Inject anomaly'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
