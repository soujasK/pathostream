import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { api } from './api/client'
import type { StationReading } from './api/types'
import { DisclaimerBar } from './components/DisclaimerBar'
import { Header } from './components/Header'
import { StatusHero } from './components/StatusHero'
import { CdsCardView } from './components/hospital/CdsCardView'
import { PatientControls } from './components/hospital/PatientControls'
import { TriageVitals } from './components/hospital/TriageVitals'
import { CciTrendChart } from './components/river/CciTrendChart'
import { EventLog } from './components/river/EventLog'
import { ForecastPanel } from './components/river/ForecastPanel'
import { RiverMap } from './components/river/RiverMap'
import { StationList } from './components/river/StationList'
import { Panel, PanelHeader } from './components/ui/Panel'
import { Reveal } from './components/ui/Reveal'
import { useCdsCard } from './hooks/useCdsCard'
import { useDemoTick } from './hooks/useDemoTick'

export default function App() {
  const stationsQuery = useQuery({ queryKey: ['demo-stations'], queryFn: api.stations, staleTime: Infinity })
  const boundaryQuery = useQuery({
    queryKey: ['catchment-boundary'],
    queryFn: api.catchmentBoundary,
    staleTime: Infinity,
  })
  const configQuery = useQuery({ queryKey: ['demo-config'], queryFn: api.config, staleTime: Infinity })

  const { latest, breached, toggleStation, reset } = useDemoTick()

  const [selectedStationId, setSelectedStationId] = useState('STN-POWAI')
  const [betaLactamAllergy, setBetaLactamAllergy] = useState(false)
  const [renalImpairment, setRenalImpairment] = useState(false)

  const stations = stationsQuery.data ?? []
  const readingByStation = useMemo(
    () => new Map<string, StationReading>((latest?.stations ?? []).map((r) => [r.station_id, r])),
    [latest],
  )
  const flaggedCount = latest?.stations.filter((s) => s.biohazard_flag_active).length ?? 0
  const worstStation = useMemo(() => {
    const flagged = (latest?.stations ?? []).filter((s) => s.biohazard_flag_active)
    if (flagged.length === 0) return undefined
    return flagged.reduce((worst, s) => (s.cci > worst.cci ? s : worst), flagged[0])
  }, [latest])
  const selectedStation = stations.find((s) => s.station_id === selectedStationId)
  const selectedFlagged = readingByStation.get(selectedStationId)?.biohazard_flag_active ?? false
  const biohazardThreshold = configQuery.data?.cci_biohazard_threshold ?? 25

  const cdsQuery = useCdsCard({
    station: selectedStation,
    betaLactamAllergy,
    renalImpairment,
    tick: latest?.tick,
  })

  return (
    <div className="min-h-full">
      <Header flaggedCount={flaggedCount} totalStations={stations.length} onReset={() => void reset()} />
      <StatusHero
        flaggedCount={flaggedCount}
        totalStations={stations.length}
        worstStation={worstStation}
        biohazardThreshold={biohazardThreshold}
      />
      <DisclaimerBar />

      <main className="mx-auto max-w-7xl px-6 py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <Reveal delay={0.05}>
              <Panel padded={false} className="overflow-hidden">
                <div className="border-b border-border px-5 py-4">
                  <PanelHeader title="River monitoring" subtitle="Mithi River corridor, Mumbai (illustrative)" />
                </div>
                <div className="h-[480px]">
                  <RiverMap
                    stations={stations}
                    readings={latest?.stations ?? []}
                    forecasts={latest?.forecast ?? []}
                    boundary={boundaryQuery.data}
                    selectedStationId={selectedStationId}
                    onSelectStation={setSelectedStationId}
                  />
                </div>
                <div className="border-t border-border px-5 py-4">
                  <div className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">
                    Live ingest feed
                  </div>
                  <EventLog history={latest?.history ?? []} />
                </div>
              </Panel>
            </Reveal>

            <Reveal delay={0.12}>
              <Panel>
                <PanelHeader
                  title="Catchment Contamination Index"
                  subtitle="Ecosystem-health trend, independent of any hospital alert"
                />
                <CciTrendChart
                  history={latest?.history ?? []}
                  stations={stations}
                  biohazardThreshold={biohazardThreshold}
                />
              </Panel>
            </Reveal>

            <Reveal delay={0.15}>
              <Panel>
                <PanelHeader
                  title="Predicted downstream impact"
                  subtitle="Propagation forecast -- illustrative model, not calibrated hydrology"
                />
                <ForecastPanel forecasts={latest?.forecast ?? []} />
              </Panel>
            </Reveal>

            <Reveal delay={0.18}>
              <Panel>
                <PanelHeader title="Simulator controls" subtitle="Inject an acute sewage-backflow reading" />
                <StationList
                  stations={stations}
                  readingByStation={readingByStation}
                  breached={breached}
                  onToggleBreach={toggleStation}
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

            <Reveal delay={0.14}>
              <Panel>
                <PanelHeader title="Emergency department" subtitle="Triage Bay 3 -- demo patient" />
                <TriageVitals flagged={selectedFlagged} />
              </Panel>
            </Reveal>

            <Reveal delay={0.2}>
              <Panel>
                <PanelHeader title="Patient context" />
                <PatientControls
                  stations={stations}
                  readingByStation={readingByStation}
                  selectedStationId={selectedStationId}
                  onSelectStation={setSelectedStationId}
                  betaLactamAllergy={betaLactamAllergy}
                  onBetaLactamAllergyChange={setBetaLactamAllergy}
                  renalImpairment={renalImpairment}
                  onRenalImpairmentChange={setRenalImpairment}
                />
              </Panel>
            </Reveal>
          </div>
        </div>
      </main>
    </div>
  )
}
