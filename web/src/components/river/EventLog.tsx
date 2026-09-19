import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import type { HistoryPoint } from '../../api/types'

interface EventLogProps {
  history: HistoryPoint[]
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  return `${minutes}m ago`
}

/** A compact, most-recent-first feed of raw ingest events -- the thing that
 * makes this read as a live running system instead of a static mockup. */
export function EventLog({ history }: EventLogProps) {
  const recent = [...history].reverse().slice(0, 8)

  if (recent.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-muted">Waiting for the first reading&hellip;</p>
  }

  return (
    <ul className="space-y-0 font-mono text-[12px]">
      <AnimatePresence initial={false}>
        {recent.map((point) => (
          <motion.li
            key={`${point.tick}-${point.station_id}`}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25 }}
            className="flex items-center gap-2.5 border-b border-border/60 py-1.5 last:border-0"
          >
            <span
              className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', point.biohazard_flag_active ? 'bg-critical' : 'bg-healthy')}
            />
            <span className="w-24 shrink-0 text-ink-muted">{timeAgo(point.observed_at)}</span>
            <span className="w-24 shrink-0 font-semibold text-ink">{point.station_id}</span>
            <span className="text-ink-muted">CCI {point.cci.toFixed(1)}</span>
            {point.biohazard_flag_active && <span className="ml-auto text-[10px] font-bold text-critical uppercase">flag</span>}
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  )
}
