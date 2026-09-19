import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { api } from './api/client'
import type { StationEvaluation } from './api/types'
import { useTelemetryTick } from './hooks/useTelemetryTick'
import { CdsCardView } from './components/CdsCardView'
import { DisclaimerBar } from './components/DisclaimerBar'
import { Header } from './components/Header'
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

function worstEvaluation(evaluations: StationEvaluation[]): StationEvaluation | undefined {
  const score = (e: StationEvaluation): number => {
    if (e.isOwnFlag || e.phase === 'confirmed') return 2;
    if (e.phase === 'predicted') return 1;
    return 0;
  }
  return [...evaluations].sort((a, b) => score(b) - score(a) || b.probability - a.probability)[0]
}

export default function App() {
  const queryClient = useQueryClient()

  const stationsQuery = useQuery({ queryKey: ['demo-stations'], queryFn: api.stations, staleTime: Infinity })
  const stateQuery = useQuery({ queryKey: ['demo-state'], queryFn: api.state, refetchInterval: POLL_INTERVAL_MS })
  const forecastsQuery = useQuery({
    queryKey: ['demo-forecasts'],
    queryFn: api.forecasts,
    refetchInterval: POLL_INTERVAL_MS,
  })

  const stations = stationsQuery.data ?? []
  const stationStates = stateQuery.data?.stations ?? []
  const evaluations = stateQuery.data?.evaluations ?? []
  const forecasts = forecastsQuery.data?.forecasts ?? []
  const worst = useMemo(() => worstEvaluation(evaluations), [evaluations])

  const [selectedStationId, setSelectedStationId] = useState<string | undefined>(undefined)
  const effectiveSelected = selectedStationId ?? stations[2]?.id // default: Parque Verde do Mondego

  const selectedStation = stations.find((s) => s.id === effectiveSelected)
  const cdsQuery = useQuery({
    queryKey: ['cds-patient-view', effectiveSelected, evaluations.find((e) => e.stationId === effectiveSelected)?.phase],
    queryFn: () => api.patientView(selectedStation!),
    enabled: selectedStation !== undefined,
    placeholderData: (previous) => previous,
  })

  const handleToggleBreach = async (stationId: string, flagged: boolean) => {
    await api.simulate({ stationId, flagged, severityIndex: 0.9, elapsedMinutes: 0 })
    await queryClient.invalidateQueries({ queryKey: ['demo-state'] })
    await queryClient.invalidateQueries({ queryKey: ['demo-forecasts'] })
  }

  const handleFastForward = async (minutes: number) => {
    const flaggedStates = stationStates.filter((s) => s.flagged)
    await Promise.all(
      flaggedStates.map((s) => {
        const currentElapsed = evaluations.find((e) => e.stationId === s.stationId)?.elapsedMinutes ?? 0
        return api.simulate({
          stationId: s.stationId,
          flagged: true,
          severityIndex: s.severityIndex,
          elapsedMinutes: currentElapsed + minutes,
        })
      }),
    )
    await queryClient.invalidateQueries({ queryKey: ['demo-state'] })
    await queryClient.invalidateQueries({ queryKey: ['demo-forecasts'] })
  }

  const telemetry = useTelemetryTick()

  const handleReset = async () => {
    await api.reset()
    await queryClient.invalidateQueries({ queryKey: ['demo-state'] })
    await queryClient.invalidateQueries({ queryKey: ['demo-forecasts'] })
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
      <StatusHero stations={stations} worst={worst} />
      <DisclaimerBar />

      <main className="mx-auto max-w-7xl px-6 py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <Reveal delay={0.05}>
              <Panel padded={false} className="overflow-hidden">
                <div className="border-b border-border px-5 py-4">
                  <PanelHeader
                    title="Monitored network"
                    subtitle={`${stations.length} real Mondego landmarks, Coimbra (illustrative geometry)`}
                  />
                </div>
                <div className="h-[460px]">
                  <ReachMap
                    stations={stations}
                    evaluations={evaluations}
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
                <ForecastPanel forecasts={forecasts} stations={stations} />
              </Panel>
            </Reveal>

            <Reveal delay={0.15}>
              <Panel>
                <PanelHeader title="Simulator controls" subtitle="Inject a biohazard event at any station" />
                <SimulatorControls
                  stations={stations}
                  states={stationStates}
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
                  stations={stations}
                  telemetry={telemetry.stations}
                  onInject={(id) => void handleInjectAnomaly(id)}
                  onClear={(id) => void handleClearAnomaly(id)}
                />
              </Panel>
            </Reveal>
          </div>

          <div className="space-y-6">
            <Reveal delay={0.08}>
              <Panel>
                <PanelHeader title="CDS Hooks patient-view card" subtitle="Live output of POST /cds-services/patient-view" />
                <CdsCardView card={cdsQuery.data?.cards[0]} isLoading={cdsQuery.isLoading} />
              </Panel>
            </Reveal>

            <Reveal delay={0.12}>
              <Panel>
                <PanelHeader title="Patient context" />
                <PatientStationPicker
                  stations={stations}
                  evaluations={evaluations}
                  selectedStationId={effectiveSelected}
                  onSelectStation={setSelectedStationId}
                />
              </Panel>
            </Reveal>

            <Reveal delay={0.16}>
              <ProvenanceNote />
            </Reveal>
          </div>
        </div>
      </main>
    </div>
  )
}
