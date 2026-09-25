import { AnimatePresence, motion } from 'framer-motion'
import type { NetworkStation, StationEvaluation } from '../api/types'
import { formatDuration } from '../lib/format'

interface StatusHeroProps {
  stations: NetworkStation[]
  worst: StationEvaluation | undefined
  networkLabel: string
}

function nameOf(stations: NetworkStation[], id: string): string {
  return stations.find((s) => s.id === id)?.name ?? id
}

const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.4 } }

export function StatusHero({ stations, worst, networkLabel }: StatusHeroProps) {
  if (stations.length === 0) {
    return <div className="h-[132px] animate-pulse bg-surface-sunken" />
  }

  const eqrBadge = worst && (
    <div className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-center backdrop-blur-sm">
      <div className="text-[10px] font-semibold tracking-wide text-white/60 uppercase">WFD class</div>
      <div className="text-lg font-bold text-white">{worst.wfd.eqrClass}</div>
    </div>
  )

  const isCritical = worst?.isOwnFlag || worst?.phase === 'confirmed'
  const isPredicted = worst && !isCritical && worst.phase === 'predicted'

  return (
    <div className="relative overflow-hidden">
      <AnimatePresence mode="wait">
        {isCritical ? (
          <motion.div
            key="confirmed"
            {...fade}
            className="relative bg-[radial-gradient(ellipse_at_top_left,_#3f0d0d_0%,_#1a0505_55%,_#0a0202_100%)] px-6 py-7 text-white"
          >
            <div className="relative mx-auto flex max-w-7xl items-center justify-between gap-6">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-critical/90 uppercase">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-critical opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-critical" />
                  </span>
                  {networkLabel} &middot; active exposure
                </div>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  Confirmed exposure at {nameOf(stations, worst!.stationId)}
                </h2>
                <p className="mt-1 text-sm text-white/65">
                  {worst!.isOwnFlag
                    ? worst!.confirmedVia === 'statistical-detection'
                      ? 'Auto-escalated from a sustained turbidity anomaly'
                      : 'Reported as confirmed contamination'
                    : `Plume from ${nameOf(stations, worst!.sourceStationId)} is passing now`}
                </p>
              </div>
              <div className="flex shrink-0 items-end gap-5">
                <div>
                  <div className="text-[11px] font-semibold tracking-wide text-white/50 uppercase">Elapsed</div>
                  <div className="text-3xl font-bold tabular-nums text-critical">{formatDuration(worst!.elapsedMinutes)}</div>
                </div>
                {eqrBadge}
              </div>
            </div>
          </motion.div>
        ) : isPredicted ? (
          <motion.div
            key="predicted"
            {...fade}
            className="relative bg-[linear-gradient(135deg,_#78350f_0%,_#451a03_60%,_#1c0a00_100%)] px-6 py-7 text-white"
          >
            <div className="relative mx-auto flex max-w-7xl items-center justify-between gap-6">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-warning uppercase">
                  <span className="h-2 w-2 rounded-full bg-warning" />
                  {networkLabel} &middot; plume predicted
                </div>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  Contamination predicted to reach {nameOf(stations, worst!.stationId)}
                </h2>
                <p className="mt-1 text-sm text-white/65">From {nameOf(stations, worst!.sourceStationId)}</p>
              </div>
              <div className="flex shrink-0 items-end gap-5">
                <div>
                  <div className="text-[11px] font-semibold tracking-wide text-white/50 uppercase">Arriving in</div>
                  <div className="text-3xl font-bold tabular-nums text-warning">
                    {formatDuration(worst!.forecast!.arrivalTimeMinutes - worst!.elapsedMinutes)}
                  </div>
                </div>
                {eqrBadge}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="nominal"
            {...fade}
            className="relative bg-[linear-gradient(135deg,_#002970_0%,_#001c55_60%,_#001033_100%)] px-6 py-7 text-white border-b border-[#00baf2]/20"
          >
            <div className="relative mx-auto max-w-7xl">
              <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-[#70cef7] uppercase">
                <span className="h-2 w-2 rounded-full bg-[#00baf2] shadow-[0_0_8px_#00baf2]" />
                {networkLabel}
              </div>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                All {stations.length} stations normal
              </h2>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
