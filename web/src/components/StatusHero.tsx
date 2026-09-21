import { AnimatePresence, motion } from 'framer-motion'
import type { NetworkStation, StationEvaluation } from '../api/types'

interface StatusHeroProps {
  stations: NetworkStation[]
  worst: StationEvaluation | undefined
  networkLabel: string
  /** Only the Mondego network reaches a hospital (CHUC) through CDS
   * Hooks in this demo -- the Douro network has no linked hospital, so
   * its confirmed/predicted copy talks about the cross-border regulatory
   * consequence instead. See README's "Two rivers, two consequences". */
  clinicalIntegration: boolean
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`
  return `${(minutes / 60).toFixed(1)} hr`
}

function nameOf(stations: NetworkStation[], id: string): string {
  return stations.find((s) => s.id === id)?.name ?? id
}

export function StatusHero({ stations, worst, networkLabel, clinicalIntegration }: StatusHeroProps) {
  if (stations.length === 0) {
    return <div className="h-[220px] animate-pulse bg-surface-sunken" />
  }

  const eqrBadge = worst && (
    <div className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-center backdrop-blur-sm">
      <div className="text-[10px] font-semibold tracking-wide text-white/60 uppercase">WFD EQR class</div>
      <div className="text-lg font-bold text-white">{worst.wfd.eqrClass}</div>
      <div className="text-[10px] text-white/50">EQR {worst.wfd.indicativeEqr}</div>
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
            <div className="relative mx-auto flex max-w-7xl flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-critical/90 uppercase">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-critical opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-critical" />
                  </span>
                  {networkLabel} -- active exposure window
                </div>
                <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  Confirmed exposure at {nameOf(stations, worst!.stationId)}
                </h1>
                <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-white/70">
                  {worst!.isOwnFlag
                    ? worst!.confirmedVia === 'statistical-detection'
                      ? 'This station was auto-escalated from a sustained statistical turbidity anomaly -- an inferred early-warning signal, not a direct pathogen measurement.'
                      : 'This station currently shows an active biohazard signature.'
                    : `Modeled contamination front from ${nameOf(stations, worst!.sourceStationId)} is passing this station now.`}{' '}
                  {clinicalIntegration
                    ? 'CDS Hooks is firing an active-exposure card with an antimicrobial-stewardship suggestion.'
                    : 'Under the Albufeira Convention, this is the kind of event Spain and Portugal share real-time hydrometeorological data about.'}
                </p>
              </div>
              <div className="flex shrink-0 items-end gap-6">
                <div>
                  <div className="text-[11px] font-semibold tracking-wide text-white/50 uppercase">Elapsed</div>
                  <div className="text-4xl font-bold tabular-nums text-critical">{formatMinutes(worst!.elapsedMinutes)}</div>
                </div>
                {eqrBadge}
              </div>
            </div>
          </motion.div>
        ) : isPredicted ? (
          <motion.div
            key="predicted"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="relative bg-[linear-gradient(135deg,_#78350f_0%,_#451a03_60%,_#1c0a00_100%)] px-6 py-10 text-white"
          >
            <div className="relative mx-auto flex max-w-7xl flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-warning uppercase">
                  <span className="h-2 w-2 rounded-full bg-warning" />
                  {networkLabel} -- inbound plume predicted
                </div>
                <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  Contamination predicted to reach {nameOf(stations, worst!.stationId)}
                </h1>
                <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-white/70">
                  A 1D advection-dispersion transport model predicts the plume from{' '}
                  {nameOf(stations, worst!.sourceStationId)} will arrive in an estimated{' '}
                  {formatMinutes(worst!.forecast!.arrivalTimeMinutes - worst!.elapsedMinutes)}.{' '}
                  {clinicalIntegration
                    ? 'A precautionary CDS Hooks card is already live for patients there.'
                    : 'This is a real FHIR RiskAssessment.prediction resource, ready to feed a cross-border early-warning process.'}
                </p>
              </div>
              <div className="flex shrink-0 items-end gap-6">
                <div>
                  <div className="text-[11px] font-semibold tracking-wide text-white/50 uppercase">Arriving in</div>
                  <div className="text-4xl font-bold tabular-nums text-warning">
                    {formatMinutes(worst!.forecast!.arrivalTimeMinutes - worst!.elapsedMinutes)}
                  </div>
                </div>
                {eqrBadge}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="nominal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="relative bg-[linear-gradient(135deg,_#1d4ed8_0%,_#1e3a8a_60%,_#0f1f4a_100%)] px-6 py-10 text-white"
          >
            <div className="relative mx-auto flex max-w-7xl flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-brand-200 uppercase">
                  <span className="h-2 w-2 rounded-full bg-brand-300" />
                  {networkLabel}
                </div>
                <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  {stations.length}-station monitoring network
                </h1>
                <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-white/75">
                  {nameOf(stations, stations[0]!.id)} to {nameOf(stations, stations[stations.length - 1]!.id)} -- a 1D
                  advection-dispersion transport model watches this network for upstream biohazard events and
                  serializes predicted downstream risk as real FHIR R4 RiskAssessment resources
                  {clinicalIntegration
                    ? ', reaching CHUC through CDS Hooks before a downstream sensor would ever confirm it.'
                    : ', ready to demonstrate a cross-border early-warning data exchange before a downstream sensor would ever confirm it.'}
                </p>
              </div>
              <div className="flex shrink-0 items-end gap-6">
                <div>
                  <div className="text-[11px] font-semibold tracking-wide text-white/50 uppercase">Stations</div>
                  <div className="text-4xl font-bold tabular-nums text-white">{stations.length}/{stations.length}</div>
                  <div className="mt-0.5 text-xs font-medium text-white/50">within safe range</div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
