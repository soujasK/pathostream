import clsx from 'clsx'

export type ViewId = 'operations' | 'emergency' | 'timeline'

const TABS: { id: ViewId; label: string; description: string }[] = [
  { id: 'operations', label: 'Water Authority Operations', description: 'Network, forecasts & demo controls' },
  { id: 'emergency', label: 'Emergency Department', description: 'Patient context & CDS Hooks alert' },
  { id: 'timeline', label: 'Incident Timeline', description: 'One narrative across both systems' },
]

export function ViewTabs({ active, onChange }: { active: ViewId; onChange: (id: ViewId) => void }) {
  return (
    <div className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={clsx(
              'shrink-0 border-b-2 px-4 py-3 text-left transition-colors',
              active === tab.id ? 'border-brand-600 text-ink' : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            <div className="text-sm font-semibold">{tab.label}</div>
            <div className="text-xs text-ink-faint">{tab.description}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
