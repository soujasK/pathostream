import { useEffect, useRef, useState } from 'react'
import type { EarlyWarningState, NetworkStation, StationEvaluation } from '../api/types'

export interface TimelineEntry {
  id: string
  timestamp: number
  catchmentLabel: string
  severity: 'info' | 'warning' | 'critical'
  message: string
}

export interface CatchmentSnapshot {
  catchmentLabel: string
  stations: NetworkStation[]
  evaluations: StationEvaluation[]
}

const MAX_ENTRIES = 60

/** An out-of-control reading is only narrated once it has lasted this many
 * consecutive ticks. A single noisy tick is statistical noise, not an
 * event: with 41 stations on a ~1.2s clock they happen every few seconds
 * and would bury the real incident story. (The 6-tick auto-escalation rule
 * is separate -- see earlyWarningEngine.ts / detectorConfig.ts.) */
const MIN_TICKS_TO_NARRATE = 2

function trailingOutOfControlRun(history: EarlyWarningState['history']): number {
  let run = 0
  for (let i = history.length - 1; i >= 0 && history[i]!.outOfControl; i--) run += 1
  return run
}

function stationName(stations: NetworkStation[], stationId: string): string {
  return stations.find((s) => s.id === stationId)?.name ?? stationId
}

/** Derives a plain-language incident timeline purely by diffing already-
 * polled, real backend state across every river plus the shared
 * telemetry layer -- nothing here is a separate fabricated data source,
 * it's a client-side observation of genuine state transitions (own-flag
 * confirmed, downstream phase changes, EWMA in-control/out-of-control
 * flips) that would otherwise be scattered across separate panels. */
export function useIncidentLog(snapshots: CatchmentSnapshot[], telemetry: EarlyWarningState[]): TimelineEntry[] {
  const [entries, setEntries] = useState<TimelineEntry[]>([])
  const previousPhaseRef = useRef<Map<string, string>>(new Map())
  const previousEscalatedRef = useRef<Map<string, boolean>>(new Map())
  const narratedFlagRef = useRef<Map<string, boolean>>(new Map())
  const seededRef = useRef(false)

  // A compact signature of just the fields the diff reads, so the effect
  // runs when something meaningful changed -- not on every render, and
  // without a variable-length dependency list (the number of rivers is
  // only known after the registry loads).
  const changeKey =
    snapshots.map((s) => s.stations.length).join(',') +
    '@' +
    snapshots
      .map((s) => s.evaluations.map((e) => `${e.stationId}:${e.isOwnFlag}:${e.phase}:${e.confirmedVia ?? ''}`).join(','))
      .join('|') +
    '#' +
    // The run length matters (capped where narration begins): a run growing
    // from 1 to 2 ticks never flips `outOfControl`, but it IS the moment
    // the anomaly becomes worth narrating.
    telemetry
      .map((t) => `${t.stationId}:${Math.min(trailingOutOfControlRun(t.history), MIN_TICKS_TO_NARRATE)}:${t.autoEscalated}`)
      .join(',')

  useEffect(() => {
    // Wait until every river's stations have loaded: otherwise a telemetry
    // poll that arrives first can't resolve a station's name or river, and
    // the baseline would be seeded from an incomplete picture.
    if (snapshots.length === 0 || snapshots.some((s) => s.stations.length === 0)) return

    const additions: TimelineEntry[] = []
    const now = Date.now()

    for (const snapshot of snapshots) {
      for (const evaluation of snapshot.evaluations) {
        const key = `${snapshot.catchmentLabel}:${evaluation.stationId}`
        const previous = previousPhaseRef.current.get(key)
        const current = evaluation.isOwnFlag ? 'own-confirmed' : evaluation.phase
        if (previous === current) continue

        const name = stationName(snapshot.stations, evaluation.stationId)
        const base = { id: `${key}-${now}`, timestamp: now, catchmentLabel: snapshot.catchmentLabel }
        if (current === 'own-confirmed') {
          const viaStatistics = evaluation.confirmedVia === 'statistical-detection'
          additions.push({
            ...base,
            severity: 'critical',
            message: viaStatistics
              ? `Sustained anomaly at ${name} auto-escalated to confirmed contamination -- the statistical early-warning system caught this before any operator report.`
              : `Confirmed contamination reported at ${name}.`,
          })
        } else if (current === 'predicted') {
          const source = stationName(snapshot.stations, evaluation.sourceStationId)
          additions.push({
            ...base,
            severity: 'warning',
            message: `Downstream arrival predicted at ${name}, propagating from ${source}.`,
          })
        } else if (current === 'confirmed' && previous !== undefined) {
          additions.push({
            ...base,
            severity: 'critical',
            message: `Predicted plume has now arrived at ${name} -- active exposure window.`,
          })
        } else if (current === 'cleared') {
          additions.push({ ...base, severity: 'info', message: `Exposure window at ${name} has cleared.` })
        }
        previousPhaseRef.current.set(key, current)
      }
    }

    for (const t of telemetry) {
      const run = trailingOutOfControlRun(t.history)
      const narrated = narratedFlagRef.current.get(t.stationId) ?? false
      const owner = snapshots.find((s) => s.stations.some((st) => st.id === t.stationId))
      const name = owner ? stationName(owner.stations, t.stationId) : t.stationId
      const label = owner?.catchmentLabel ?? ''

      if (!narrated && run >= MIN_TICKS_TO_NARRATE) {
        // "Flagged", not "sustained": the sustained claim is only made by
        // the auto-escalation entry, after the 6-tick debounce run.
        additions.push({
          id: `ewma:${t.stationId}-${now}`,
          timestamp: now,
          catchmentLabel: label,
          severity: 'warning',
          message: `Statistical early-warning system flagged a turbidity anomaly at ${name}.`,
        })
        narratedFlagRef.current.set(t.stationId, true)
      } else if (narrated && run === 0) {
        // Read from the PREVIOUS poll: clearing a test event resets
        // `autoEscalated`, so by the time the flip back is observed the
        // current value can't say whether this episode had escalated.
        const hadEscalated = previousEscalatedRef.current.get(t.stationId) ?? false
        additions.push({
          id: `ewma:${t.stationId}-${now}`,
          timestamp: now,
          catchmentLabel: label,
          severity: 'info',
          message: hadEscalated
            ? `Turbidity at ${name} has returned to its normal statistical range.`
            : `Turbidity at ${name} returned to normal before the escalation threshold -- correctly not escalated.`,
        })
        narratedFlagRef.current.set(t.stationId, false)
      }
      previousEscalatedRef.current.set(t.stationId, t.autoEscalated)
    }

    // The very first poll establishes a baseline (every station's current
    // phase/control status) without narrating it as a wall of "new"
    // events -- only transitions AFTER that baseline are real incidents.
    if (!seededRef.current) {
      seededRef.current = true
      return
    }

    if (additions.length > 0) {
      setEntries((prev) => [...additions.reverse(), ...prev].slice(0, MAX_ENTRIES))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changeKey])

  return entries
}
