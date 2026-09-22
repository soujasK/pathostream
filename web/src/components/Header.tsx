export function Header() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-xs font-bold text-white">
            OAH
          </div>
          <span className="text-base font-semibold tracking-tight text-ink">OAH River Watch</span>
        </div>
        <span className="rounded-full border border-warning-border bg-warning-bg px-3 py-1 text-xs font-medium text-warning">
          Research prototype &middot; synthetic data &middot; not a medical device
        </span>
      </div>
    </header>
  )
}
