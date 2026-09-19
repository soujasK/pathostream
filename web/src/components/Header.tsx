export function Header() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">
            OAH
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-ink">OAH-Mondego</h1>
            <p className="text-xs text-ink-muted">Coimbra, Portugal -- One Health resilience &amp; digital health standards</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-muted">
          <span className="rounded-full border border-border bg-surface-muted px-2.5 py-1">EU Horizon Europe</span>
          <span className="rounded-full border border-border bg-surface-muted px-2.5 py-1">OneAquaHealth</span>
          <span className="rounded-full border border-border bg-surface-muted px-2.5 py-1">HL7 Europe IG</span>
        </div>
      </div>
    </header>
  )
}
