import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { useState } from 'react'
import { api } from '../../api/client'
import type { NetworkStation, ObservationInput } from '../../api/types'

interface CitizenObservationsPanelProps {
  catchmentId: string
  stations: NetworkStation[]
}

const CLEAR_INPUT: ObservationInput = { clarityScore: 5, unusualOdor: false, deadWildlife: false, discoloration: false, foam: false }

const FLAG_FIELDS: { key: keyof Pick<ObservationInput, 'unusualOdor' | 'deadWildlife' | 'discoloration' | 'foam'>; label: string }[] = [
  { key: 'unusualOdor', label: 'Unusual odor' },
  { key: 'deadWildlife', label: 'Dead fish/wildlife' },
  { key: 'discoloration', label: 'Discoloration' },
  { key: 'foam', label: 'Foam' },
]

function pct(p: number): string {
  return `${Math.round(p * 100)}%`
}

/** A citizen's report -> a real, trained, explainable classifier (not the
 * EWMA statistics used elsewhere -- a genuinely different technique, see
 * SAFETY_CASE.md section 2.2) -> a human water-authority review step. The
 * classifier's "review recommended" never, by itself, creates a flag --
 * only the explicit Promote action below does (src/citizen/observations.ts). */
export function CitizenObservationsPanel({ catchmentId, stations }: CitizenObservationsPanelProps) {
  const queryClient = useQueryClient()
  const [stationId, setStationId] = useState<string>(stations[0]?.id ?? '')
  const [input, setInput] = useState<ObservationInput>(CLEAR_INPUT)
  const [note, setNote] = useState('')

  const effectiveStationId = stationId || stations[0]?.id || ''

  const list = useQuery({
    queryKey: ['citizen-observations', catchmentId],
    queryFn: async () => {
      const results = await Promise.all(stations.map((s) => api.citizenObservations.list(s.id)))
      return results.flatMap((r) => r.observations)
    },
    enabled: stations.length > 0,
    refetchInterval: 4000,
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['citizen-observations', catchmentId] })
    void queryClient.invalidateQueries({ queryKey: ['state', catchmentId] })
    void queryClient.invalidateQueries({ queryKey: ['forecasts', catchmentId] })
  }

  const submit = useMutation({
    mutationFn: () => api.citizenObservations.submit(effectiveStationId, input, note || undefined),
    onSuccess: () => {
      setInput(CLEAR_INPUT)
      setNote('')
      invalidate()
    },
  })
  const promote = useMutation({ mutationFn: (id: string) => api.citizenObservations.promote(id), onSuccess: invalidate })
  const dismiss = useMutation({ mutationFn: (id: string) => api.citizenObservations.dismiss(id), onSuccess: invalidate })

  const stationName = (id: string) => stations.find((s) => s.id === id)?.name ?? id
  const observations = list.data ?? []
  const pending = observations.filter((o) => o.status === 'pending')
  const reviewed = observations.filter((o) => o.status !== 'pending').slice(0, 5)

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-muted">
        A structured report anyone could submit (modelled on the real OneAquaHealth Citizen Science App's own
        categories) is scored by a real, trained, explainable classifier -- never auto-confirmed. A water-authority
        reviewer decides whether to promote it.
      </p>

      {/* Submission form */}
      <div className="rounded-lg border border-border bg-surface-muted p-3">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <label className="text-xs">
            <span className="mb-1 block font-medium text-ink-muted">Station</span>
            <select
              value={effectiveStationId}
              onChange={(e) => setStationId(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-ink"
            >
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            <span className="mb-1 block font-medium text-ink-muted">Water clarity (1 = very cloudy, 5 = very clear)</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setInput((prev) => ({ ...prev, clarityScore: n as ObservationInput['clarityScore'] }))}
                  className={clsx(
                    'flex-1 rounded-md border py-1.5 text-sm font-medium transition-colors',
                    input.clarityScore === n
                      ? 'border-brand-700 bg-brand-700 text-white'
                      : 'border-border bg-surface text-ink-muted hover:border-brand-300',
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </label>
        </div>

        <div className="mt-2.5 flex flex-wrap gap-3">
          {FLAG_FIELDS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-1.5 text-xs text-ink">
              <input
                type="checkbox"
                checked={input[key]}
                onChange={(e) => setInput((prev) => ({ ...prev, [key]: e.target.checked }))}
                className="h-3.5 w-3.5 rounded border-border"
              />
              {label}
            </label>
          ))}
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note (max 500 characters)"
          maxLength={500}
          rows={2}
          className="mt-2.5 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-ink"
        />

        <button
          type="button"
          onClick={() => submit.mutate()}
          disabled={submit.isPending || !effectiveStationId}
          className="mt-2.5 w-full rounded-md border border-brand-700 bg-brand-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submit.isPending ? 'Submitting…' : 'Submit observation'}
        </button>
        {submit.data && (
          <div className={clsx('mt-2.5 rounded-md border px-2.5 py-2 text-xs', submit.data.triage.recommendReview ? 'border-warning-border bg-warning-bg text-warning' : 'border-healthy-border bg-healthy-bg text-healthy')}>
            AI triage: {pct(submit.data.triage.probability)} concern ({submit.data.triage.recommendReview ? 'review recommended' : 'no concern flagged'}).
          </div>
        )}
      </div>

      {/* Pending, awaiting human review */}
      {pending.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
            Pending human review ({pending.length})
          </div>
          <div className="space-y-2">
            {pending.map((o) => (
              <div key={o.id} className="rounded-lg border border-border bg-surface p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-ink">{stationName(o.stationId)}</span>
                  <span className={clsx('rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase', o.triage.recommendReview ? 'border-warning-border bg-warning-bg text-warning' : 'border-healthy-border bg-healthy-bg text-healthy')}>
                    {pct(o.triage.probability)} concern
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-ink-faint">
                  {o.triage.explanation.contributions
                    .filter((c) => c.contribution > 0.05)
                    .sort((a, b) => b.contribution - a.contribution)
                    .map((c) => c.feature)
                    .join(', ') || 'no notable risk factors'}
                  {o.note ? ` — "${o.note}"` : ''}
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => promote.mutate(o.id)}
                    disabled={promote.isPending}
                    className="rounded-md border border-critical-border bg-critical-bg px-2.5 py-1 text-xs font-medium text-critical"
                  >
                    Promote to confirmed
                  </button>
                  <button
                    type="button"
                    onClick={() => dismiss.mutate(o.id)}
                    disabled={dismiss.isPending}
                    className="rounded-md border border-border bg-surface-muted px-2.5 py-1 text-xs font-medium text-ink-muted"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {reviewed.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-faint uppercase">Recently reviewed</div>
          <div className="space-y-1">
            {reviewed.map((o) => (
              <div key={o.id} className="flex items-center justify-between text-xs text-ink-muted">
                <span>{stationName(o.stationId)}</span>
                <span className={o.status === 'promoted' ? 'text-critical' : 'text-ink-faint'}>{o.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
