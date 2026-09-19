import { motion } from 'framer-motion'
import clsx from 'clsx'

interface StatTileProps {
  label: string
  value: string
  alert?: boolean
}

export function StatTile({ label, value, alert = false }: StatTileProps) {
  return (
    <div
      className={clsx(
        'rounded-lg border px-4 py-3 transition-colors duration-300',
        alert ? 'border-critical-border bg-critical-bg' : 'border-border bg-surface-muted',
      )}
    >
      <div className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase">{label}</div>
      <motion.div
        key={value}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className={clsx('mt-1 text-lg font-semibold tabular-nums', alert ? 'text-critical' : 'text-ink')}
      >
        {value}
      </motion.div>
    </div>
  )
}
