import clsx from 'clsx'

interface PanelProps {
  children: React.ReactNode
  className?: string
  padded?: boolean
}

export function Panel({ children, className, padded = true }: PanelProps) {
  return (
    <div className={clsx('rounded-xl border border-border bg-surface shadow-card', padded && 'p-5', className)}>
      {children}
    </div>
  )
}

export function PanelHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold tracking-wide text-ink uppercase">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
