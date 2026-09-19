import { AnimatePresence, motion } from 'framer-motion'
import type { StationReading } from '../api/types'

interface StatusHeroProps {
  flaggedCount: number
  totalStations: number
  worstStation: StationReading | undefined
  biohazardThreshold: number
}

export function StatusHero({ flaggedCount, totalStations, worstStation, biohazardThreshold }: StatusHeroProps) {
  const isCritical = flaggedCount > 0 && worstStation

  return (
    <div className="relative overflow-hidden">
      <AnimatePresence mode="wait">
        {isCritical ? (
          <motion.div
            key="critical"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="relative bg-[radial-gradient(ellipse_at_top_left,_#3f0d0d_0%,_#1a0505_55%,_#0a0202_100%)] px-6 py-10 text-white"
          >
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute -top-24 right-[8%] h-72 w-72 rounded-full bg-critical/30 blur-3xl"
              animate={{ opacity: [0.35, 0.7, 0.35], scale: [1, 1.12, 1] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
            />
            <div className="relative mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-critical/90 uppercase">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-critical opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-critical" />
                  </span>
                  Live One Health surveillance -- biohazard alert active
                </div>
                <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  Waterborne exposure at {worstStation!.station_id}
                </h1>
                <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-white/70">
                  Sepsis Golden Hour protocol has been triggered downstream: patients whose home address falls in
                  this catchment are now surfacing a critical CDS Hooks card in the Emergency Department, in real
                  time, with zero manual lookup.
                </p>
              </div>
              <div className="flex shrink-0 items-end gap-8 sm:items-center">
                <div>
                  <div className="text-[11px] font-semibold tracking-wide text-white/50 uppercase">
                    Contamination index
                  </div>
                  <div className="text-5xl font-bold tabular-nums text-critical">{worstStation!.cci.toFixed(0)}</div>
                  <div className="mt-0.5 text-xs font-medium text-white/50">
                    {(worstStation!.cci / biohazardThreshold).toFixed(1)}&times; biohazard threshold
                  </div>
                </div>
                <div className="h-14 w-px bg-white/10" />
                <div>
                  <div className="text-[11px] font-semibold tracking-wide text-white/50 uppercase">Stations</div>
                  <div className="text-5xl font-bold tabular-nums text-white">
                    {flaggedCount}
                    <span className="text-xl text-white/40">/{totalStations}</span>
                  </div>
                  <div className="mt-0.5 text-xs font-medium text-white/50">currently flagged</div>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="healthy"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="relative bg-[linear-gradient(135deg,_#0f766e_0%,_#0c5a53_60%,_#0a4a45_100%)] px-6 py-10 text-white"
          >
            <div className="relative mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-emerald-200 uppercase">
                  <span className="h-2 w-2 rounded-full bg-emerald-300" />
                  Live One Health surveillance -- nominal
                </div>
                <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  All {totalStations} catchment stations nominal
                </h1>
                <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-white/75">
                  Synthetic river sensors feed a Catchment Contamination Index every few seconds. The moment one
                  crosses threshold, the same signal reaches the Emergency Department as a live FHIR + CDS Hooks
                  card -- one pipeline, from sensor to bedside alert.
                </p>
              </div>
              <div className="shrink-0">
                <div className="text-[11px] font-semibold tracking-wide text-white/50 uppercase">Stations</div>
                <div className="text-5xl font-bold tabular-nums text-white">{totalStations}/{totalStations}</div>
                <div className="mt-0.5 text-xs font-medium text-white/50">within safe range</div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
