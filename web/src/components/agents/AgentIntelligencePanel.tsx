import clsx from 'clsx'
import { useState } from 'react'
import { api, type Catchment } from '../../api/client'
import type { AgentNarrative, AgentThoughtTrace, EvidenceBasis, MultiAgentConsensus } from '../../api/types'
import { Badge } from '../ui/Badge'
import { Panel, PanelHeader } from '../ui/Panel'

interface ClinicalPreset {
  label: string
  patientId: string
  symptoms: string
  isImmunocompromised: boolean
}

const PRESETS: ClinicalPreset[] = [
  {
    label: 'Watery diarrhea',
    patientId: 'PT-101',
    symptoms: 'Profuse watery diarrhea, abdominal cramping, nausea, low fever',
    isImmunocompromised: false,
  },
  {
    label: 'Rash after water contact',
    patientId: 'PT-102',
    symptoms: 'Acute erythematous skin rash, headache, nausea post recreational contact',
    isImmunocompromised: false,
  },
  {
    label: 'Bloody diarrhea',
    patientId: 'PT-103',
    symptoms: 'High fever, bloody stools, severe enterocolitis, severe cramping',
    isImmunocompromised: true,
  },
  {
    label: 'Fever after flood contact',
    patientId: 'PT-104',
    symptoms: 'High fever, severe calf myalgias, conjunctival suffusion, jaundice post river flood',
    isImmunocompromised: false,
  },
  {
    label: 'No GI symptoms',
    patientId: 'PT-105',
    symptoms: 'Mild fatigue, no acute gastrointestinal symptoms',
    isImmunocompromised: false,
  },
]

const EVIDENCE_LABEL: Record<EvidenceBasis, string> = {
  none: 'No active signal',
  inferred_statistical: 'Inferred (statistical, unconfirmed)',
  human_confirmed: 'Human-confirmed',
}

const SIGNAL_LABEL: Record<MultiAgentConsensus['sentinel']['signalClassification'], string> = {
  no_data: 'No readings yet',
  within_control_limits: 'Normal',
  turbidity_anomaly_unconfirmed: 'Unusual cloudiness (not confirmed)',
  human_confirmed_contamination: 'Confirmed by a person',
}

const hours = (h: number | null) => (h === null ? 'n/a' : `${h} h`)

/** Which engine produced this run -- so a rule-based run is never shown
 * under a model's name, and a model's narrative is always labelled. */
function EngineBanner({ narratives, traces }: { narratives: AgentNarrative[]; traces: AgentThoughtTrace[] }) {
  const live = narratives.filter((n) => n.engine.provenance === 'live_llm')
  const reasons = [...new Set(narratives.map((n) => n.engine.fallbackReason).filter(Boolean))]
  const gaps = live.filter((n) => n.evidenceGapsFilled.length > 0)
  const requested = traces.filter((t) => t.source === 'model_requested_tool').length
  const rejected = traces.filter((t) => t.source === 'rejected_tool_call').length
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
      <span className="font-bold">Engine:</span>{' '}
      {live.length === 0
        ? 'Rule-based only -- no language model was used in this run. All values come from deterministic tools.'
        : `${live[0]!.engine.engineId} investigated through a guarded tool interface (${requested} call(s) allowed, ${rejected} rejected) and wrote the labelled summaries. Every value and proposal is computed by the agents themselves and is the same whatever the model does.`}
      {gaps.length > 0 && (
        <div className="mt-1 text-[11px]">
          Evidence the model's summary did not see (gathered deterministically):{' '}
          {gaps.map((n) => `${n.agentRole.replace(/_/g, ' ')}: ${n.evidenceGapsFilled.join(', ')}`).join('; ')}.
        </div>
      )}
      {reasons.length > 0 && <div className="mt-1 text-[11px]">Model not used or incomplete: {reasons.join('; ')}.</div>}
    </div>
  )
}

const TRACE_SOURCE_LABEL: Record<AgentThoughtTrace['source'], string> = {
  deterministic_tool: 'deterministic tool',
  model_requested_tool: 'model-requested tool (guarded)',
  rejected_tool_call: 'REJECTED model call',
  language_model: 'language model',
}

export function AgentIntelligencePanel({
  catchments,
  activeCatchment,
  onSelectCatchment,
}: {
  catchments: Array<{ id: string; label: string; stationCount: number }>
  activeCatchment: Catchment
  onSelectCatchment: (c: Catchment) => void
}) {
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<MultiAgentConsensus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showTraces, setShowTraces] = useState(false)

  // Pipeline Inputs
  const [patientId, setPatientId] = useState('PT-COIMBRA-409')
  const [patientLat, setPatientLat] = useState('40.2056')
  const [patientLon, setPatientLon] = useState('-8.4195')
  const [symptoms, setSymptoms] = useState('Severe watery diarrhea, cramping, mild fever')
  const [isImmunocompromised, setIsImmunocompromised] = useState(false)

  const handleRunPipeline = async () => {
    setIsRunning(true)
    setError(null)
    try {
      const latitude = Number(patientLat)
      const longitude = Number(patientLon)
      if (patientLat.trim() === '' || patientLon.trim() === '' || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new Error('Latitude and longitude must be numbers.')
      }
      const res = await api.agents.deliberate({
        catchmentId: activeCatchment,
        patientContext: { patientId, latitude, longitude, symptoms, isImmunocompromised },
      })
      setResult(res)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Execution failed')
    } finally {
      setIsRunning(false)
    }
  }

  const applyPreset = (preset: ClinicalPreset) => {
    setPatientId(preset.patientId)
    setSymptoms(preset.symptoms)
    setIsImmunocompromised(preset.isImmunocompromised)
  }

  const topPathogen = result?.clinicalTriage?.pathogenRankings[0]
  const topTest = result?.clinicalTriage?.recommendedDiagnostics[0]

  return (
    <div className="space-y-6">
      {/* Status Header */}
      <Panel padded={false} className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-surface-muted px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-ink tracking-tight">Multi-Agent Decision Support</h2>
            <p className="mt-1 text-xs text-ink-muted">
              River telemetry, citizen reports and clinical triage combined into a draft proposal. Nothing is issued, sent or ordered -- every output needs human review.
            </p>
          </div>

          <button
            type="button"
            onClick={handleRunPipeline}
            disabled={isRunning}
            className="rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-brand-800 disabled:opacity-50"
          >
            {isRunning ? 'Running...' : 'Run Agents'}
          </button>
        </div>
      </Panel>

      {/* Input Configuration Section */}
      <Panel>
        <PanelHeader
          title="Inputs"
          subtitle="River catchment and a synthetic test patient"
        />

        <div className="space-y-4 text-xs">
          {/* Catchment Selection */}
          <div>
            <span className="font-semibold text-ink">River Catchment</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {catchments.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelectCatchment(c.id)}
                  className={clsx(
                    'rounded-md px-3 py-1.5 font-medium transition-colors',
                    activeCatchment === c.id
                      ? 'bg-brand-700 text-white'
                      : 'border border-border bg-surface text-ink-muted hover:border-brand-300 hover:text-ink',
                  )}
                >
                  {c.label} ({c.stationCount} stations)
                </button>
              ))}
            </div>
          </div>

          {/* Preset Buttons */}
          <div>
            <span className="font-semibold text-ink">Symptom Presets</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="rounded border border-border bg-surface px-2.5 py-1 text-ink hover:border-brand-300"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Patient Parameters Form */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="font-semibold text-ink">Patient ID</label>
              <input
                type="text"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                className="mt-1 w-full rounded border border-border bg-surface px-2.5 py-1.5 text-ink"
              />
            </div>
            <div>
              <label className="font-semibold text-ink">Latitude</label>
              <input
                type="text"
                value={patientLat}
                onChange={(e) => setPatientLat(e.target.value)}
                className="mt-1 w-full rounded border border-border bg-surface px-2.5 py-1.5 text-ink"
              />
            </div>
            <div>
              <label className="font-semibold text-ink">Longitude</label>
              <input
                type="text"
                value={patientLon}
                onChange={(e) => setPatientLon(e.target.value)}
                className="mt-1 w-full rounded border border-border bg-surface px-2.5 py-1.5 text-ink"
              />
            </div>
          </div>

          <div>
            <label className="font-semibold text-ink">Clinical Symptoms</label>
            <textarea
              rows={2}
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-surface p-2 text-ink"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="immuno"
              checked={isImmunocompromised}
              onChange={(e) => setIsImmunocompromised(e.target.checked)}
              className="rounded border-border"
            />
            <label htmlFor="immuno" className="text-ink">
              Patient is immunocompromised
            </label>
          </div>
        </div>
      </Panel>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}

      {/* Outputs for EACH of the 4 Agents */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold tracking-wide text-ink uppercase">Agent Outputs</h3>
          {result && (
            <span className="font-mono text-xs text-ink-muted">
              Incident ID: {result.incidentId}
            </span>
          )}
        </div>

        {result && (
          <div className="mb-3">
            <EngineBanner narratives={result.narratives} traces={result.traces} />
          </div>
        )}

        {result ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* 01 Sentinel Agent Output */}
            <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
              <div className="flex items-center justify-between border-b border-border pb-2.5">
                <span className="font-mono text-xs font-bold text-ink-muted">01</span>
                <span className="text-xs font-bold text-ink uppercase">Sentinel</span>
                <Badge
                  severity={
                    result.sentinel.severity === 'critical'
                      ? 'critical'
                      : result.sentinel.severity === 'moderate'
                      ? 'warning'
                      : 'healthy'
                  }
                >
                  {result.sentinel.severity}
                </Badge>
              </div>

              <div className="mt-3 space-y-2 text-xs">
                <div>
                  <span className="text-ink-muted">Station:</span>{' '}
                  <span className="font-mono font-semibold text-ink">{result.sentinel.stationId ?? 'whole catchment'}</span>
                </div>
                <div>
                  <span className="text-ink-muted">Water cloudiness:</span>{' '}
                  <span className="font-mono font-semibold text-ink">
                    {result.sentinel.turbidityNtu === null ? 'no data' : `${result.sentinel.turbidityNtu} NTU`}
                  </span>
                </div>
                <div>
                  <span className="text-ink-muted">Unusual-reading score (rough):</span>{' '}
                  <span className="font-mono font-semibold text-ink">{result.sentinel.anomalyScore.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-ink-muted">Signal:</span>{' '}
                  <span className="font-semibold text-ink">{SIGNAL_LABEL[result.sentinel.signalClassification]}</span>
                </div>
                <div>
                  <span className="text-ink-muted">Reaches next station in:</span>{' '}
                  <span className="font-mono font-semibold text-ink">
                    {hours(result.sentinel.downstreamArrivalEtaHours)}
                    {result.sentinel.downstreamArrivalBandHours &&
                      ` (90% band ${result.sentinel.downstreamArrivalBandHours.low}-${result.sentinel.downstreamArrivalBandHours.high} h, illustrative)`}
                  </span>
                </div>
                <div className="border-t border-border pt-2 text-[11px] text-ink-muted">
                  {result.sentinel.rationale}
                </div>
              </div>
            </div>

            {/* 02 Citizen Intel Agent Output */}
            <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
              <div className="flex items-center justify-between border-b border-border pb-2.5">
                <span className="font-mono text-xs font-bold text-ink-muted">02</span>
                <span className="text-xs font-bold text-ink uppercase">Citizen Intel</span>
                <Badge severity={result.citizenIntel.priorityGroundInvestigationRecommended ? 'warning' : 'healthy'}>
                  {result.citizenIntel.priorityGroundInvestigationRecommended ? 'Investigate' : 'Normal'}
                </Badge>
              </div>

              <div className="mt-3 space-y-2 text-xs">
                <div>
                  <span className="text-ink-muted">Reports:</span>{' '}
                  <span className="font-mono font-semibold text-ink">
                    {result.citizenIntel.clusterCount} ({result.citizenIntel.reviewedCount} reviewed)
                  </span>
                </div>
                <div>
                  <span className="text-ink-muted">Matches the sensor signal:</span>{' '}
                  <span className="font-semibold text-ink">
                    {result.citizenIntel.correlatesWithPlume === null
                      ? 'not assessed'
                      : result.citizenIntel.correlatesWithPlume
                      ? 'Yes (reviewed reports)'
                      : 'No'}
                  </span>
                </div>
                <div>
                  <span className="text-ink-muted">Reported phenomena:</span>{' '}
                  <span className="font-semibold text-ink">
                    {result.citizenIntel.reportedVisualSymptoms.length > 0
                      ? result.citizenIntel.reportedVisualSymptoms.join(', ')
                      : 'None'}
                  </span>
                </div>
                <div className="border-t border-border pt-2 text-[11px] text-ink-muted">
                  {result.citizenIntel.rationale}
                </div>
              </div>
            </div>

            {/* 03 Clinical Triage Agent Output */}
            <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
              <div className="flex items-center justify-between border-b border-border pb-2.5">
                <span className="font-mono text-xs font-bold text-ink-muted">03</span>
                <span className="text-xs font-bold text-ink uppercase">Clinical Triage</span>
                {result.clinicalTriage ? (
                  <Badge severity={result.clinicalTriage.triagePriority === 'URGENT' ? 'warning' : 'healthy'}>
                    Review: {result.clinicalTriage.triagePriority}
                  </Badge>
                ) : (
                  <span className="text-xs text-ink-muted">N/A</span>
                )}
              </div>

              {result.clinicalTriage ? (
                <div className="mt-3 space-y-2 text-xs">
                  <div>
                    <span className="text-ink-muted">Patient:</span>{' '}
                    <span className="font-mono font-semibold text-ink">{result.clinicalTriage.patientId}</span>
                  </div>
                  <div>
                    <span className="text-ink-muted">Top symptom match:</span>{' '}
                    <span className="font-semibold text-purple-700">
                      {topPathogen
                        ? `${topPathogen.pathogen} (heuristic score ${topPathogen.heuristicScore}, not a probability)`
                        : 'no pattern matched'}
                    </span>
                  </div>
                  <div>
                    <span className="text-ink-muted">Test to consider:</span>{' '}
                    <span className="font-mono text-[11px] text-ink">
                      {topTest ? `${topTest.testName}${topTest.loincCode ? ` (LOINC ${topTest.loincCode})` : ''}` : 'none'}
                    </span>
                  </div>
                  <div className="border-t border-border pt-2 text-[11px] text-ink-muted line-clamp-3">
                    {result.clinicalTriage.waterExposureEvidenceSummary}
                  </div>
                  {result.clinicalTriage.contraindicationsOrWarnings && result.clinicalTriage.contraindicationsOrWarnings.length > 0 && (
                    <div className="mt-2 rounded border border-red-300 bg-red-50 p-2 text-[10px] text-red-900 leading-snug dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                      <span className="font-bold">Caution:</span> {result.clinicalTriage.contraindicationsOrWarnings[0]}
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-4 text-xs text-ink-muted">No patient context provided.</div>
              )}
            </div>

            {/* 04 Incident Commander Agent Output */}
            <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
              <div className="flex items-center justify-between border-b border-border pb-2.5">
                <span className="font-mono text-xs font-bold text-ink-muted">04</span>
                <span className="text-xs font-bold text-ink uppercase">Commander</span>
                <Badge
                  severity={
                    result.overallSeverity === 'critical'
                      ? 'critical'
                      : result.overallSeverity === 'moderate'
                      ? 'warning'
                      : 'healthy'
                  }
                >
                  {result.overallSeverity}
                </Badge>
              </div>

              <div className="mt-3 space-y-2 text-xs">
                <div>
                  <span className="text-ink-muted">Evidence:</span>{' '}
                  <span className="font-semibold text-ink">{EVIDENCE_LABEL[result.evidenceBasis]}</span>
                </div>
                <div>
                  <span className="text-ink-muted">Proposed action:</span>{' '}
                  <span className="font-semibold uppercase text-brand-700">
                    {result.commanderDirective.proposedAction.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                  Draft -- not issued. Requires authority approval.
                </div>
                <div className="border-t border-border pt-2 text-[11px] text-ink-muted line-clamp-3">
                  {result.commanderDirective.municipalAdvisory}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border py-12 text-center">
            <h4 className="text-sm font-semibold text-ink">Not run yet</h4>
            <p className="mt-1 text-xs text-ink-muted">
              Set the inputs above and click "Run Agents" to see what Sentinel, Citizen Intel, Clinical Triage and the Commander find.
            </p>
          </div>
        )}
      </div>

      {/* Proposed notices, model summaries, agent log and evidence trace */}
      {result && (
        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Proposed Notices" subtitle="Drafts for the competent authority -- not issued or sent" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
              <div className="rounded-lg border border-border bg-surface-muted p-3">
                <span className="font-bold text-ink uppercase">Municipal notice (draft)</span>
                <p className="mt-1.5 leading-relaxed text-ink-muted">
                  {result.commanderDirective.municipalAdvisory}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-surface-muted p-3">
                <span className="font-bold text-ink uppercase">Clinician notice (draft)</span>
                <p className="mt-1.5 leading-relaxed text-ink-muted">
                  {result.commanderDirective.ehrBroadcastAlert}
                </p>
              </div>
            </div>
          </Panel>

          {result.narratives.some((n) => n.text) && (
            <Panel>
              <PanelHeader
                title="Model-Generated Summaries"
                subtitle="Written by a language model over the evidence above; not used for any value or proposal"
              />
              <div className="space-y-2 text-xs">
                {result.narratives
                  .filter((n) => n.text)
                  .map((n) => (
                    <div key={n.agentRole} className="rounded-lg border border-border bg-surface-muted p-3">
                      <span className="font-bold uppercase text-ink">{n.agentRole.replace(/_/g, ' ')}</span>
                      <span className="ml-2 font-mono text-[10px] text-ink-muted">{n.engine.engineId}</span>
                      <p className="mt-1.5 leading-relaxed text-ink-muted">{n.text}</p>
                    </div>
                  ))}
              </div>
            </Panel>
          )}

          <Panel>
            <PanelHeader title="Agent Log" subtitle="What each agent found, in order" />
            <div className="space-y-2 rounded-lg border border-border bg-surface p-4">
              {result.agentDebateLog.map((log, idx) => (
                <div key={idx} className="flex items-start gap-2.5 text-xs">
                  <span className="mt-0.5 shrink-0 rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <p className="font-mono text-ink leading-relaxed">{log}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <button
              type="button"
              onClick={() => setShowTraces(!showTraces)}
              className="flex w-full items-center justify-between text-xs font-semibold text-ink"
            >
              <span>Evidence Trace ({result.traces.length} steps)</span>
              <span className="font-mono text-xs text-ink-muted">{showTraces ? 'Hide' : 'Show'}</span>
            </button>

            {showTraces && (
              <div className="mt-3 space-y-2 max-h-96 overflow-y-auto rounded-lg border border-border bg-surface p-3 font-mono text-xs">
                {result.traces.map((trace: AgentThoughtTrace, idx: number) => (
                  <div key={idx} className="rounded border border-border bg-surface-muted/40 p-2.5">
                    <div className="flex items-center justify-between text-[11px] text-ink-muted">
                      <span className="font-bold uppercase text-brand-700">{trace.agentRole}</span>
                      <span>
                        Step {trace.step} &middot; {TRACE_SOURCE_LABEL[trace.source]} &middot;{' '}
                        {new Date(trace.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="mt-1 text-ink">{trace.thought}</p>
                    {!!trace.action && (
                      <div className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                        <span className="font-bold">Action:</span> {trace.action}({JSON.stringify(trace.actionInput)})
                      </div>
                    )}
                    {!!trace.observation && (
                      <div className="mt-1 max-h-32 overflow-y-auto text-[10px] text-ink-muted bg-surface p-1 rounded">
                        <span className="font-bold">Observation:</span> {JSON.stringify(trace.observation, null, 2)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <div className="rounded-lg border border-border bg-surface-muted/60 p-3.5 text-[11px] text-ink-muted leading-relaxed">
            <span className="font-semibold text-ink">Decision Support Notice:</span> {result.decisionSupportNotice}
            {result.clinicalTriage && <div className="mt-1.5">{result.clinicalTriage.clinicalDisclaimer}</div>}
          </div>
        </div>
      )}
    </div>
  )
}
