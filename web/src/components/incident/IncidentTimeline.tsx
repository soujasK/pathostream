import clsx from 'clsx'
import type { TimelineEntry } from '../../hooks/useIncidentLog'

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const DOT_CLASS: Record<TimelineEntry['severity'], string> = {
  critical: 'bg-critical',
  warning: 'bg-warning',
  info: 'bg-healthy',
}

export function IncidentTimeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return <div className="py-8 text-center text-sm text-ink-muted">No incidents yet</div>
  }

  return (
    <ol className="space-y-0">
      {entries.map((entry, index) => (
        <li key={entry.id} className="relative flex gap-3 pb-5 pl-1 last:pb-0">
          {index !== entries.length - 1 && (
            <span className="absolute top-3 left-[7px] h-full w-px bg-border" aria-hidden="true" />
          )}
          <span className={clsx('mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full ring-4 ring-surface', DOT_CLASS[entry.severity])} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-mono text-ink-faint">{formatTime(entry.timestamp)}</span>
              <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-[10px] font-semibold tracking-wide text-ink-muted uppercase">
                {entry.catchmentLabel}
              </span>
            </div>
            <p className="mt-1 text-sm text-ink">{entry.message}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}
