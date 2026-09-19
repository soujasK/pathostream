import clsx from 'clsx'
import type { Severity } from '../../lib/severity'
import { SEVERITY_TOKENS } from '../../lib/severity'

interface BadgeProps {
  severity: Severity
  children: React.ReactNode
  className?: string
}

export function Badge({ severity, children, className }: BadgeProps) {
  const tokens = SEVERITY_TOKENS[severity]
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase',
        tokens.text,
        tokens.bg,
        tokens.border,
        className,
      )}
    >
      <span className={clsx('h-1.5 w-1.5 rounded-full', tokens.dot)} aria-hidden="true" />
      {children}
    </span>
  )
}
