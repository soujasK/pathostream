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
          <span className="hidden rounded-full border border-border bg-surface-muted px-2.5 py-1 sm:inline-block">EU Horizon Europe</span>
          <span className="hidden rounded-full border border-border bg-surface-muted px-2.5 py-1 sm:inline-block">OneAquaHealth</span>
          <span className="hidden rounded-full border border-border bg-surface-muted px-2.5 py-1 sm:inline-block">HL7 Europe IG</span>
          <a
            href="http://localhost:5173/"
            className="rounded-md border border-border px-2.5 py-1.5 font-medium text-ink-muted transition-colors hover:border-brand-300 hover:text-ink"
            title="The sibling case study: an independent Python/FastAPI implementation of the same pattern for the Mithi River, Mumbai"
          >
            PathoStream-EHR (India) &rarr;
          </a>
        </div>
      </div>
    </header>
  )
}
