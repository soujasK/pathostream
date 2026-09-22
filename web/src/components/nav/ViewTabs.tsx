import clsx from 'clsx'

export type ViewId = 'operations' | 'emergency' | 'timeline'

const TABS: { id: ViewId; label: string }[] = [
  { id: 'operations', label: 'Water Authority' },
  { id: 'emergency', label: 'Emergency Department' },
  { id: 'timeline', label: 'Timeline' },
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
              'shrink-0 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors',
              active === tab.id ? 'border-brand-600 text-ink' : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  )
}
