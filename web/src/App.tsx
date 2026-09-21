import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import { api, type Catchment } from './api/client'
import type { StationEvaluation } from './api/types'
import { CdsCardView } from './components/CdsCardView'
import { DisclaimerBar } from './components/DisclaimerBar'
import { Header } from './components/Header'
import { IncidentTimeline } from './components/incident/IncidentTimeline'
import { ViewTabs, type ViewId } from './components/nav/ViewTabs'
import { ProvenanceNote } from './components/ProvenanceNote'
import { StatusHero } from './components/StatusHero'
import { EarlyWarningPanel } from './components/reach/EarlyWarningPanel'
import { EuropeMap } from './components/reach/EuropeMap'
import { ForecastPanel } from './components/reach/ForecastPanel'
import { PatientStationPicker } from './components/reach/PatientStationPicker'
import { ReachMap } from './components/reach/ReachMap'
import { SimulatorControls } from './components/reach/SimulatorControls'
import { Panel, PanelHeader } from './components/ui/Panel'
import { Reveal } from './components/ui/Reveal'
import { useAllCatchmentData, useCatchmentRegistry } from './hooks/useCatchments'
import { useIncidentLog } from './hooks/useIncidentLog'
import { useTelemetryTick } from './hooks/useTelemetryTick'

function worstEvaluation(evaluations: StationEvaluation[]): StationEvaluation | undefined {
  const score = (e: StationEvaluation): number => {
    if (e.isOwnFlag || e.phase === 'confirmed') return 2
    if (e.phase === 'predicted') return 1
    return 0
  }
  return [...evaluations].sort((a, b) => score(b) - score(a) || b.probability - a.probability)[0]
}

export default function App() {
  const queryClient = useQueryClient()
  const [activeView, setActiveView] = useState<ViewId>('operations')

  // Every river comes from the backend registry -- nothing here names one.
  const registry = useCatchmentRegistry()
  const data = useAllCatchmentData(registry.catchments)
  const [selectedCatchment, setSelectedCatchment] = useState<Catchment | undefined>(undefined)
  const activeCatchment = selectedCatchment ?? registry.catchments[0]?.id ?? ''
  const active = data[activeCatchment]

  const allStations = registry.catchments.flatMap((c) => data[c.id]?.stations ?? [])
  const totalStations = registry.catchments.reduce((sum, c) => sum + c.stationCount, 0)

  // The patient's home address is any station on any river; default to the
  // third Coimbra station, the original demo patient.
  const [selectedStationId, setSelectedStationId] = useState<string | undefined>(undefined)
  const effectivePatient = selectedStationId ?? data['mondego']?.stations[2]?.id ?? allStations[0]?.id
  const patientStation = allStations.find((s) => s.id === effectivePatient)
  const patientCatchmentId = registry.catchments.find((c) =>
    data[c.id]?.stations.some((s) => s.id === effectivePatient),
  )?.id
  const patientPhase = data[patientCatchmentId ?? '']?.evaluations.find((e) => e.stationId === effectivePatient)?.phase
  const cdsQuery = useQuery({
    queryKey: ['cds-patient-view', effectivePatient, patientPhase],
    queryFn: () => api.patientView(patientStation!),
    enabled: patientStation !== undefined,
    placeholderData: (previous) => previous,
  })

  // The hero follows the river being looked at: the one selected on the
  // Operations/Timeline tabs, or the patient's river on the ED tab.
  const heroCatchmentId = activeView === 'emergency' ? (patientCatchmentId ?? activeCatchment) : activeCatchment
  const hero = data[heroCatchmentId]
  const worst = useMemo(() => worstEvaluation(hero?.evaluations ?? []), [hero?.evaluations])

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

  const incidentEntries = useIncidentLog(
    registry.catchments.map((c) => ({
      catchmentLabel: c.label,
      stations: data[c.id]?.stations ?? [],
      evaluations: data[c.id]?.evaluations ?? [],
    })),
    telemetry.stations,
  )

  const invalidateActive = async () => {
    await queryClient.invalidateQueries({ queryKey: ['state', activeCatchment] })
    await queryClient.invalidateQueries({ queryKey: ['forecasts', activeCatchment] })
  }

  const handleToggleBreach = async (stationId: string, flagged: boolean) => {
    await api.simulate(activeCatchment, { stationId, flagged, severityIndex: 0.9, elapsedMinutes: 0 })
    await invalidateActive()
  }

  const handleFastForward = async (minutes: number) => {
    if (!active) return
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

  const activeInfo = active?.info

  return (
    <div className="min-h-full">
      <Header />
      <StatusHero
        stations={hero?.stations ?? []}
        worst={worst}
        networkLabel={hero ? `${hero.info.label} river network` : ''}
        governanceName={hero?.info.governance?.name}
      />
      <DisclaimerBar />
      <ViewTabs active={activeView} onChange={setActiveView} />

      <main className="mx-auto max-w-7xl px-6 py-6">
        {activeView === 'operations' && active && activeInfo && (
          <>
            <Reveal delay={0.03}>
              <Panel padded={false} className="mb-6 overflow-hidden">
                <div className="border-b border-border px-5 py-4">
                  <PanelHeader
                    title="Coverage"
                    subtitle={`${registry.catchments.length} rivers · ${totalStations} stations · ${registry.countriesCovered.length} EU member states -- real, verified stations; lines are schematic, not the rivers' courses. Click a river to open it.`}
                  />
                </div>
                <div className="h-[380px]">
                  <EuropeMap
                    rivers={registry.catchments.map((c) => ({
                      id: c.id,
                      label: c.label,
                      stations: data[c.id]?.stations ?? [],
                      evaluations: data[c.id]?.evaluations ?? [],
                    }))}
                    activeId={activeCatchment}
                    onSelect={setSelectedCatchment}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface-muted px-5 py-3">
                  <span className="text-xs font-semibold tracking-wide text-ink-muted uppercase">River:</span>
                  {registry.catchments.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedCatchment(c.id)}
                      title={c.region}
                      className={clsx(
                        'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                        activeCatchment === c.id
                          ? 'border-brand-700 bg-brand-700 text-white'
                          : 'border-border bg-surface text-ink-muted hover:border-brand-300 hover:text-ink',
                      )}
                    >
                      {c.label} <span className="opacity-70">&middot; {c.stationCount}</span>
                    </button>
                  ))}
                  <span className="ml-auto text-xs text-ink-muted">
                    {activeInfo.label}: {activeInfo.region}
                    {activeInfo.riverLengthKm ? ` · ${activeInfo.riverLengthKm.toLocaleString()} km` : ''}
                    {activeInfo.countries.length > 1 ? ` · ${activeInfo.countries.length} countries` : ''}
                  </span>
                </div>
              </Panel>
            </Reveal>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="space-y-6">
                <Reveal delay={0.05}>
                  <Panel padded={false} className="overflow-hidden">
                    <div className="border-b border-border px-5 py-4">
                      <PanelHeader
                        title={`${activeInfo.label} monitored reach`}
                        subtitle={`${active.stations.length} real stations, ${activeInfo.region} (illustrative geometry)`}
                      />
                    </div>
                    <div className="h-[460px]">
                      <ReachMap
                        key={activeCatchment}
                        stations={active.stations}
                        evaluations={active.evaluations}
                        selectedStationId={effectivePatient}
                        onSelectStation={setSelectedStationId}
                      />
                    </div>
                  </Panel>
                </Reveal>

                <Reveal delay={0.1}>
                  <Panel>
                    <PanelHeader
                      title="Predicted downstream impact"
                      subtitle="Propagation forecast across this river -- illustrative model, not calibrated hydrology"
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
                  <ProvenanceNote catchments={registry.catchments} activeId={activeCatchment} />
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
                    subtitle={
                      patientStation
                        ? `For a patient living near ${patientStation.name} -- live output of POST /cds-services/patient-view`
                        : 'Live output of POST /cds-services/patient-view'
                    }
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
                    Pick any station on any river as the patient&rsquo;s home address. The alert works the same
                    everywhere; a hospital is named only in Coimbra (CHUC, a real hospital used as framing) -- on
                    every other river the card says &ldquo;your institution&rsquo;s protocol&rdquo; rather than
                    inventing one.
                  </p>
                  <PatientStationPicker
                    groups={registry.catchments.map((c) => ({
                      id: c.id,
                      label: `${c.label} · ${c.region}`,
                      stations: data[c.id]?.stations ?? [],
                      evaluations: data[c.id]?.evaluations ?? [],
                    }))}
                    selectedStationId={effectivePatient}
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
                subtitle={`Every real state change across all ${registry.catchments.length} rivers, in plain language, as it happens`}
              />
              <IncidentTimeline entries={incidentEntries} />
            </Panel>
          </Reveal>
        )}
      </main>
    </div>
  )
}
