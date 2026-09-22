import { useState } from 'react'
import type { CatchmentInfo, ProvenanceRow } from '../api/types'

const SHARED_ROWS: ProvenanceRow[] = [
  { claim: 'Fischer (1979) / Liu (1977) dispersion-coefficient formula', status: 'verified', note: 'Confirmed against two independent secondary sources; available for real channel geometry, not used for any river’s flat default.' },
  { claim: 'Closed-form model solves the governing transport PDE', status: 'verified', note: 'Checked against a direct finite-difference numerical solution, not just asserted -- see METHODS.md §4.' },
  { claim: 'EWMA control chart (Roberts 1959) for statistical early-warning detection', status: 'verified', note: 'Real citation and formula, exact time-varying control limits, independently tested; shared across every river’s stations. See METHODS.md §8.' },
  { claim: 'Early-warning telemetry reflects real sensor readings', status: 'illustrative', note: 'No -- synthetic Gaussian noise around a documented baseline, for every river. The algorithm is real; the data feeding it is not. See METHODS.md §8.' },
  { claim: 'Auto-escalation rule (6 consecutive out-of-control ticks → confirmed, severity 0.7)', status: 'illustrative', note: 'The threshold is derived by simulation (the smallest value meeting a stated false-escalation target -- see EVALUATION.md), not chosen by feel, but is not calibrated to any real river. Clinician-facing cards say the flag was inferred from a turbidity trend, never a direct biohazard measurement. See METHODS.md §8.' },
  { claim: 'GDPR Article 9 / EU Health Data Space (Reg. (EU) 2025/327) compliance', status: 'illustrative', note: 'Not implemented -- named and discussed honestly as a real, current, acknowledged gap. See METHODS.md §9.' },
]

function Row({ row }: { row: ProvenanceRow }) {
  return (
    <div className="flex items-start gap-3 px-5 py-3">
      <span
        className={
          'mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ' +
          (row.status === 'verified'
            ? 'border-healthy-border bg-healthy-bg text-healthy'
            : 'border-warning-border bg-warning-bg text-warning')
        }
      >
        {row.status}
      </span>
      <div>
        <div className="text-sm font-medium text-ink">{row.claim}</div>
        <div className="text-xs text-ink-muted">{row.note}</div>
      </div>
    </div>
  )
}

function Section({
  title,
  subtitle,
  rows,
  open,
  onToggle,
}: {
  title: string
  subtitle?: string
  rows: ProvenanceRow[]
  open: boolean
  onToggle: () => void
}) {
  const verified = rows.filter((r) => r.status === 'verified').length
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 bg-surface-sunken px-5 py-2 text-left"
      >
        <span>
          <span className="text-[11px] font-semibold tracking-wider text-ink uppercase">{title}</span>
          {subtitle && <span className="ml-2 text-[11px] text-ink-faint">{subtitle}</span>}
        </span>
        <span className="shrink-0 text-[11px] text-ink-faint">
          {verified} verified &middot; {rows.length - verified} illustrative {open ? '▲' : '▼'}
        </span>
      </button>
      {open && <div className="divide-y divide-border">{rows.map((row) => <Row key={row.claim} row={row} />)}</div>}
    </div>
  )
}

/** The disclosure panel: per-river rows come straight from the backend
 * registry, so a new river's sourcing appears here automatically. Collapsed
 * by default so it adds no clutter, but always one click away; when opened,
 * the river currently on screen is expanded. */
export function ProvenanceNote({ catchments, activeId }: { catchments: CatchmentInfo[]; activeId: string }) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [toggled, setToggled] = useState<Record<string, boolean>>({})
  const isOpen = (id: string, defaultOpen: boolean) => toggled[id] ?? defaultOpen
  const toggle = (id: string, defaultOpen: boolean) => setToggled((prev) => ({ ...prev, [id]: !isOpen(id, defaultOpen) }))

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setPanelOpen((open) => !open)}
        aria-expanded={panelOpen}
        className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left"
      >
        <span className="text-sm font-semibold tracking-wide text-ink uppercase">Verified vs illustrative</span>
        <span className="text-[11px] text-ink-faint">{panelOpen ? '▲' : '▼'}</span>
      </button>
      {panelOpen && (
        <div className="divide-y divide-border border-t border-border">
          {catchments.map((c) => (
            <Section
              key={c.id}
              title={c.label}
              subtitle={c.region}
              rows={c.provenance}
              open={isOpen(c.id, c.id === activeId)}
              onToggle={() => toggle(c.id, c.id === activeId)}
            />
          ))}
          <Section
            title="Shared across every river"
            rows={SHARED_ROWS}
            open={isOpen('shared', false)}
            onToggle={() => toggle('shared', false)}
          />
        </div>
      )}
    </div>
  )
}
