import { Badge } from './ui/Badge'

interface HeaderProps {
  flaggedCount: number
  totalStations: number
  onReset: () => void
}

export function Header({ flaggedCount, totalStations, onReset }: HeaderProps) {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">
              PS
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-ink">PathoStream-EHR</h1>
              <p className="text-xs text-ink-muted">One Health clinical decision support -- prototype</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {flaggedCount > 0 ? (
            <Badge severity="critical">
              {flaggedCount} of {totalStations} stations flagged
            </Badge>
          ) : (
            <Badge severity="healthy">All stations nominal</Badge>
          )}
          <a
            href="http://localhost:5174/"
            className="hidden rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-brand-300 hover:text-ink sm:inline-block"
            title="A second, independently implemented case study on a real European river (Mondego, Coimbra, Portugal)"
          >
            OAH-Mondego (Europe) &rarr;
          </a>
          <button
            type="button"
            onClick={onReset}
            className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-brand-300 hover:text-ink"
          >
            Reset demo
          </button>
        </div>
      </div>
    </header>
  )
}
