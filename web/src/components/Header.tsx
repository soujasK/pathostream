export function Header() {
  return (
    <header className="border-b border-border bg-surface/90 backdrop-blur-md sticky top-0 z-40">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#002970] to-[#001c55] border border-[#00baf2]/30 text-xs font-bold text-[#00baf2] tracking-wider shadow-sm">
            OAH
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-base font-semibold tracking-tight text-ink">PathoStream EHR</span>
            <span className="text-xs text-ink-muted hidden sm:inline">&middot; River Watch &amp; CDS</span>
          </div>
        </div>
      </div>
    </header>
  )
}
