import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import { api, type Catchment } from './api/client'
import type { StationEvaluation } from './api/types'
import { useIncidentLog } from './hooks/useIncidentLog'
import { useTelemetryTick } from './hooks/useTelemetryTick'
import { CdsCardView } from './components/CdsCardView'
import { DisclaimerBar } from './components/DisclaimerBar'
import { Header } from './components/Header'
import { IncidentTimeline } from './components/incident/IncidentTimeline'
import { ViewTabs, type ViewId } from './components/nav/ViewTabs'
import { ProvenanceNote } from './components/ProvenanceNote'
import { StatusHero } from './components/StatusHero'
import { EarlyWarningPanel } from './components/reach/EarlyWarningPanel'
import { ForecastPanel } from './components/reach/ForecastPanel'
import { PatientStationPicker } from './components/reach/PatientStationPicker'
import { ReachMap } from './components/reach/ReachMap'
import { SimulatorControls } from './components/reach/SimulatorControls'
import { Panel, PanelHeader } from './components/ui/Panel'
import { Reveal } from './components/ui/Reveal'

const POLL_INTERVAL_MS = 3000

const CATCHMENTS: { id: Catchment; label: string; sub: string }[] = [
  { id: 'mondego', label: 'Mondego', sub: 'Coimbra, Portugal' },
  { id: 'douro', label: 'Douro', sub: 'Cross-border, Spain → Portugal' },
]

function worstEvaluation(evaluations: StationEvaluation[]): StationEvaluation | undefined {
  const score = (e: StationEvaluation): number => {
    if (e.isOwnFlag || e.phase === 'confirmed') return 2
    if (e.phase === 'predicted') return 1
    return 0
  }
  return [...evaluations].sort((a, b) => score(b) - score(a) || b.probability - a.probability)[0]
}

/** One network's data, fetched independently so switching the Operations
 * tab's active catchment never loses the other network's live polling --
 * the Incident Timeline needs both regardless of which is on screen. */
function useCatchmentData(catchment: Catchment) {
  const stationsQuery = useQuery({
    queryKey: ['stations', catchment],
    queryFn: () => api.stations(catchment),
    staleTime: Infinity,
  })
  const stateQuery = useQuery({
    queryKey: ['state', catchment],
    queryFn: () => api.state(catchment),
    refetchInterval: POLL_INTERVAL_MS,
  })
  const forecastsQuery = useQuery({
    queryKey: ['forecasts', catchment],
    queryFn: () => api.forecasts(catchment),
    refetchInterval: POLL_INTERVAL_MS,
  })

  return {
    stations: stationsQuery.data ?? [],
    stationStates: stateQuery.data?.stations ?? [],
    evaluations: stateQuery.data?.evaluations ?? [],
    forecasts: forecastsQuery.data?.forecasts ?? [],
  }
}

export default function App() {
  const queryClient = useQueryClient()
  const [activeView, setActiveView] = useState<ViewId>('operations')
  const [activeCatchment, setActiveCatchment] = useState<Catchment>('mondego')

  const mondego = useCatchmentData('mondego')
  const douro = useCatchmentData('douro')
  const active = activeCatchment === 'mondego' ? mondego : douro

  // The hero banner follows the Operations tab's catchment switcher only
  // while that tab is open -- the Emergency Department view is inherently
  // Mondego-scoped (see "Two rivers, two consequences"), and Timeline is
  // a shared view, so both fall back to Mondego rather than showing a
  // stale Douro banner behind an unrelated screen.
  const heroCatchment: Catchment = activeView === 'operations' ? activeCatchment : 'mondego'
  const hero = heroCatchment === 'mondego' ? mondego : douro
  const worst = useMemo(() => worstEvaluation(hero.evaluations), [hero.evaluations])

  const [selectedStationId, setSelectedStationId] = useState<string | undefined>(undefined)
  const effectiveSelected = selectedStationId ?? mondego.stations[2]?.id // default: Parque Verde do Mondego
  const selectedStation = mondego.stations.find((s) => s.id === effectiveSelected)
  const cdsQuery = useQuery({
    queryKey: [
      'cds-patient-view',
      effectiveSelected,
      mondego.evaluations.find((e) => e.stationId === effectiveSelected)?.phase,
    ],
    queryFn: () => api.patientView(selectedStation!),
    enabled: selectedStation !== undefined,
    placeholderData: (previous) => previous,
  })

  const telemetry = useTelemetryTick()

  // Telemetry ticks every ~1.2s but exposure state only polls every 3s, so
  // without this a viewer could see "Escalated -> confirmed" beside a hero
  // and map still reading "all healthy". Refresh exposure state the moment
  // the set of auto-escalated stations changes.
  const escalatedKey = telemetry.stations
    .filter((s) => s.autoEscalated)
    .map((s) => s.stationId)
    .join(',')
  useEffect(() => {
    if (escalatedKey === '') return
    void queryClient.invalidateQueries({ queryKey: ['state'] })
    void queryClient.invalidateQueries({ queryKey: ['forecasts'] })
  }, [escalatedKey, queryClient])

  const incidentEntries = useIncidentLog({
    mondego: { catchmentLabel: 'Mondego', stations: mondego.stations, evaluations: mondego.evaluations },
    douro: { catchmentLabel: 'Douro', stations: douro.stations, evaluations: douro.evaluations },
    telemetry: telemetry.stations,
  })

  const invalidateActive = async () => {
    await queryClient.invalidateQueries({ queryKey: ['state', activeCatchment] })
    await queryClient.invalidateQueries({ queryKey: ['forecasts', activeCatchment] })
  }

  const handleToggleBreach = async (stationId: string, flagged: boolean) => {
    await api.simulate(activeCatchment, { stationId, flagged, severityIndex: 0.9, elapsedMinutes: 0 })
    await invalidateActive()
  }

  const handleFastForward = async (minutes: number) => {
    const flaggedStates = active.stationStates.filter((s) => s.flagged)
    await Promise.all(
      flaggedStates.map((s) => {
        const currentElapsed = active.evaluations.find((e) => e.stationId === s.stationId)?.elapsedMinutes ?? 0
        return api.simulate(activeCatchment, {
          stationId: s.stationId,
          flagged: true,
          severityIndex: s.severityIndex,
          elapsedMinutes: currentElapsed + minutes,
        })
      }),
    )
    await invalidateActive()
  }

  const handleReset = async () => {
    await api.reset(activeCatchment)
    await invalidateActive()
    await telemetry.refresh()
  }

  const handleInjectAnomaly = async (stationId: string) => {
    await api.telemetryInject(stationId)
  }
  const handleClearAnomaly = async (stationId: string) => {
    await api.telemetryClear(stationId)
  }

  return (
    <div className="min-h-full">
      <Header />
      <StatusHero
        stations={hero.stations}
        worst={worst}
        networkLabel={heroCatchment === 'mondego' ? 'Mondego River network' : 'Douro cross-border network'}
        clinicalIntegration={heroCatchment === 'mondego'}
      />
      <DisclaimerBar />
      <ViewTabs active={activeView} onChange={setActiveView} />

      <main className="mx-auto max-w-7xl px-6 py-6">
        {activeView === 'operations' && (
          <>
            <div className="mb-6 flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Network:</span>
              {CATCHMENTS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveCatchment(c.id)}
                  className={clsx(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    activeCatchment === c.id
                      ? 'border-brand-700 bg-brand-700 text-white'
                      : 'border-border bg-surface-muted text-ink-muted hover:border-brand-300 hover:text-ink',
                  )}
                >
                  {c.label} <span className="opacity-70">&middot; {c.sub}</span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="space-y-6">
                <Reveal delay={0.05}>
                  <Panel padded={false} className="overflow-hidden">
                    <div className="border-b border-border px-5 py-4">
                      <PanelHeader
                        title="Monitored network"
                        subtitle={
                          activeCatchment === 'mondego'
                            ? `${active.stations.length} real Mondego landmarks, Coimbra (illustrative geometry)`
                            : `${active.stations.length} real stations, Spain → Portugal (illustrative geometry)`
                        }
                      />
                    </div>
                    <div className="h-[460px]">
                      <ReachMap
                        key={activeCatchment}
                        stations={active.stations}
                        evaluations={active.evaluations}
                        selectedStationId={effectiveSelected}
                        onSelectStation={setSelectedStationId}
                      />
                    </div>
                  </Panel>
                </Reveal>

                <Reveal delay={0.1}>
                  <Panel>
                    <PanelHeader
                      title="Predicted downstream impact"
                      subtitle="Propagation forecast across the network -- illustrative model, not calibrated hydrology"
                    />
                    <ForecastPanel forecasts={active.forecasts} stations={active.stations} />
                  </Panel>
                </Reveal>

                <Reveal delay={0.15}>
                  <Panel>
                    <PanelHeader title="Demo & testing tools" subtitle="Report a confirmed contamination event at any station" />
                    <SimulatorControls
                      stations={active.stations}
                      states={active.stationStates}
                      onToggleBreach={(id, flagged) => void handleToggleBreach(id, flagged)}
                      onFastForward={(minutes) => void handleFastForward(minutes)}
                      onReset={() => void handleReset()}
                    />
                  </Panel>
                </Reveal>

                <Reveal delay={0.18}>
                  <Panel>
                    <PanelHeader
                      title="Statistical early-warning layer"
                      subtitle="Live EWMA control chart over raw per-station telemetry"
                    />
                    <EarlyWarningPanel
                      stations={active.stations}
                      telemetry={telemetry.stations}
                      onInject={(id) => void handleInjectAnomaly(id)}
                      onClear={(id) => void handleClearAnomaly(id)}
                    />
                  </Panel>
                </Reveal>
              </div>

              <div className="space-y-6">
                <Reveal delay={0.16}>
                  <ProvenanceNote />
                </Reveal>
              </div>
            </div>
          </>
        )}

        {activeView === 'emergency' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              <Reveal delay={0.05}>
                <Panel>
                  <PanelHeader
                    title="CDS Hooks patient-view card"
                    subtitle="Live output of POST /cds-services/patient-view"
                  />
                  <CdsCardView card={cdsQuery.data?.cards[0]} isLoading={cdsQuery.isLoading} />
                </Panel>
              </Reveal>
            </div>

            <div className="space-y-6">
              <Reveal delay={0.08}>
                <Panel>
                  <PanelHeader title="Patient context" />
                  <p className="mb-3 text-xs text-ink-muted">
                    This clinical view is scoped to the Mondego network only — CHUC, the hospital named in this
                    demo's CDS Hooks cards, sits on the Mondego. The Douro cross-border network has no linked
                    hospital in this prototype; see "Two rivers, two consequences" in README.md.
                  </p>
                  <PatientStationPicker
                    stations={mondego.stations}
                    evaluations={mondego.evaluations}
                    selectedStationId={effectiveSelected}
                    onSelectStation={setSelectedStationId}
                  />
                </Panel>
              </Reveal>
            </div>
          </div>
        )}

        {activeView === 'timeline' && (
          <Reveal delay={0.05}>
            <Panel>
              <PanelHeader
                title="Incident timeline"
                subtitle="Every real state change across both networks, in plain language, as it happens"
              />
              <IncidentTimeline entries={incidentEntries} />
            </Panel>
          </Reveal>
        )}
      </main>
    </div>
  )
}
