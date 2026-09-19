import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import type { DemoTickResponse } from '../api/types'

const DEFAULT_TICK_INTERVAL_MS = 4000

//: Pre-breach one station so a cold judge sees the story (flagged marker,
// critical CDS card) immediately, with nothing to click first. "Reset demo"
// also returns to this state, not to all-healthy, so a presenter can restart
// the same narrative before every take.
const DEFAULT_BREACHED_STATIONS = ['STN-POWAI']

/** Drives the live simulation loop: on a fixed cadence, POSTs the current
 * breach-toggle set to `/demo/tick` (which re-runs the real simulator +
 * CCI engine server-side) and stores the result. Toggling a station takes
 * effect on the *next* tick, matching a real sensor's reporting cadence --
 * the interval itself never resets, so the cadence stays steady regardless
 * of how often the user interacts with the controls. */
export function useDemoTick(intervalMs: number = DEFAULT_TICK_INTERVAL_MS) {
  const [breached, setBreached] = useState<Set<string>>(() => new Set(DEFAULT_BREACHED_STATIONS))
  const breachedRef = useRef(breached)
  breachedRef.current = breached

  const [latest, setLatest] = useState<DemoTickResponse | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const runTick = useCallback(async () => {
    try {
      const result = await api.tick(Array.from(breachedRef.current))
      setLatest(result)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Demo tick failed'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void runTick()
    const handle = setInterval(() => void runTick(), intervalMs)
    return () => clearInterval(handle)
  }, [runTick, intervalMs])

  const toggleStation = useCallback((stationId: string) => {
    setBreached((prev) => {
      const next = new Set(prev)
      if (next.has(stationId)) {
        next.delete(stationId)
      } else {
        next.add(stationId)
      }
      return next
    })
  }, [])

  const reset = useCallback(async () => {
    await api.reset()
    setBreached(new Set(DEFAULT_BREACHED_STATIONS))
    breachedRef.current = new Set(DEFAULT_BREACHED_STATIONS)
    await runTick()
  }, [runTick])

  return { latest, breached, toggleStation, isLoading, error, reset }
}
