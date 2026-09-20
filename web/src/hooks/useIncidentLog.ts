import { useEffect, useRef, useState } from 'react'
import type { EarlyWarningState, NetworkStation, StationEvaluation } from '../api/types'

export interface TimelineEntry {
  id: string
  timestamp: number
  catchmentLabel: string
  severity: 'info' | 'warning' | 'critical'
  message: string
}

interface CatchmentSnapshot {
  catchmentLabel: string
  stations: NetworkStation[]
  evaluations: StationEvaluation[]
}

interface IncidentLogInputs {
  mondego: CatchmentSnapshot
  douro: CatchmentSnapshot
  telemetry: EarlyWarningState[]
}

const MAX_ENTRIES = 40

function stationName(stations: NetworkStation[], stationId: string): string {
  return stations.find((s) => s.id === stationId)?.name ?? stationId
}

/** Derives a plain-language incident timeline purely by diffing already-
 * polled, real backend state across both catchments plus the shared
 * telemetry layer -- nothing here is a separate fabricated data source,
 * it's a client-side observation of genuine state transitions (own-flag
 * confirmed, downstream phase changes, EWMA in-control/out-of-control
 * flips) that would otherwise be scattered across separate panels. */
export function useIncidentLog({ mondego, douro, telemetry }: IncidentLogInputs): TimelineEntry[] {
  const [entries, setEntries] = useState<TimelineEntry[]>([])
  const previousPhaseRef = useRef<Map<string, string>>(new Map())
  const previousOutOfControlRef = useRef<Map<string, boolean>>(new Map())
  const seededRef = useRef(false)

  useEffect(() => {
    const additions: TimelineEntry[] = []
    const now = Date.now()

    for (const snapshot of [mondego, douro]) {
      for (const evaluation of snapshot.evaluations) {
        const key = `${snapshot.catchmentLabel}:${evaluation.stationId}`
        const previous = previousPhaseRef.current.get(key)
        const current = evaluation.isOwnFlag ? 'own-confirmed' : evaluation.phase
        if (previous !== current) {
          const name = stationName(snapshot.stations, evaluation.stationId)
          if (current === 'own-confirmed') {
            additions.push({
              id: `${key}-${now}`,
              timestamp: now,
              catchmentLabel: snapshot.catchmentLabel,
              severity: 'critical',
              message: `Confirmed contamination reported at ${name}.`,
            })
          } else if (current === 'predicted') {
            const source = stationName(snapshot.stations, evaluation.sourceStationId)
            additions.push({
              id: `${key}-${now}`,
              timestamp: now,
              catchmentLabel: snapshot.catchmentLabel,
              severity: 'warning',
              message: `Downstream arrival predicted at ${name}, propagating from ${source}.`,
            })
          } else if (current === 'confirmed' && previous !== undefined) {
            additions.push({
              id: `${key}-${now}`,
              timestamp: now,
              catchmentLabel: snapshot.catchmentLabel,
              severity: 'critical',
              message: `Predicted plume has now arrived at ${name} -- active exposure window.`,
            })
          } else if (current === 'cleared') {
            additions.push({
              id: `${key}-${now}`,
              timestamp: now,
              catchmentLabel: snapshot.catchmentLabel,
              severity: 'info',
              message: `Exposure window at ${name} has cleared.`,
            })
          }
          previousPhaseRef.current.set(key, current)
        }
      }
    }

    const allStations = [...mondego.stations, ...douro.stations]
    for (const t of telemetry) {
      const outOfControl = t.latest?.outOfControl ?? false
      const previous = previousOutOfControlRef.current.get(t.stationId)
      if (previous !== undefined && previous !== outOfControl) {
        const name = stationName(allStations, t.stationId)
        additions.push({
          id: `ewma:${t.stationId}-${now}`,
          timestamp: now,
          catchmentLabel: mondego.stations.some((s) => s.id === t.stationId) ? mondego.catchmentLabel : douro.catchmentLabel,
          severity: outOfControl ? 'warning' : 'info',
          message: outOfControl
            ? `Statistical early-warning system detected a sustained turbidity anomaly at ${name}.`
            : `Turbidity trend at ${name} has returned to its normal statistical range.`,
        })
      }
      previousOutOfControlRef.current.set(t.stationId, outOfControl)
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
  }, [mondego.evaluations, douro.evaluations, telemetry])

  return entries
}
