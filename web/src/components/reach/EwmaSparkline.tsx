import type { EwmaResult } from '../../api/types'

interface EwmaSparklineProps {
  history: EwmaResult[]
  width?: number
  height?: number
}

/** Small inline SVG chart -- no charting library dependency for a single
 * per-station sparkline: raw telemetry (thin gray line), the EWMA
 * statistic (bold brand-colored line), and the control-limit band (shaded
 * region) that a point crossing means "statistically out of control". */
export function EwmaSparkline({ history, width = 220, height = 56 }: EwmaSparklineProps) {
  if (history.length < 2) {
    return (
      <div style={{ width, height }} className="flex items-center justify-center text-xs text-ink-faint">
        Waiting for samples&hellip;
      </div>
    )
  }

  const values = history.flatMap((h) => [h.sample, h.z, h.upperControlLimit, h.lowerControlLimit])
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = Math.max(max - min, 1e-6)
  const pad = 4

  const x = (i: number) => pad + (i / (history.length - 1)) * (width - 2 * pad)
  const y = (v: number) => height - pad - ((v - min) / span) * (height - 2 * pad)

  const linePath = (accessor: (h: EwmaResult) => number) =>
    history.map((h, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(accessor(h)).toFixed(1)}`).join(' ')

  const bandPath =
    history.map((h, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(h.upperControlLimit).toFixed(1)}`).join(' ') +
    ' ' +
    history
      .slice()
      .reverse()
      .map((h, i) => `L ${x(history.length - 1 - i).toFixed(1)} ${y(h.lowerControlLimit).toFixed(1)}`)
      .join(' ') +
    ' Z'

  const latest = history.at(-1)!

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Water cloudiness trend (EWMA)">
      <path d={bandPath} fill="var(--color-brand-100)" opacity={0.5} stroke="none" />
      <path d={linePath((h) => h.sample)} fill="none" stroke="var(--color-ink-faint)" strokeWidth={1} />
      <path
        d={linePath((h) => h.z)}
        fill="none"
        stroke={latest.outOfControl ? 'var(--color-critical)' : 'var(--color-brand-600)'}
        strokeWidth={2}
      />
      <circle
        cx={x(history.length - 1)}
        cy={y(latest.z)}
        r={3}
        fill={latest.outOfControl ? 'var(--color-critical)' : 'var(--color-brand-600)'}
      />
    </svg>
  )
}
