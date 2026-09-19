import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import type { EarlyWarningState } from '../api/types'

const TICK_INTERVAL_MS = 1200

/** Drives the statistical early-warning layer's live clock: on a fixed
 * cadence, POSTs to /demo/telemetry/tick (which generates one new noisy
 * sample per station server-side and re-evaluates each station's EWMA
 * control chart) and stores the result -- mirrors the shape of the
 * exposure engine's own polling loop in App.tsx, but drives its own
 * independent clock rather than reusing it, since this is a genuinely
 * separate signal (see earlyWarningEngine.ts's docstring). */
export function useTelemetryTick() {
  const [stations, setStations] = useState<EarlyWarningState[]>([])
  const [error, setError] = useState<Error | null>(null)
  const mountedRef = useRef(true)

  const runTick = useCallback(async () => {
    try {
      const result = await api.telemetryTick()
      if (mountedRef.current) {
        setStations(result.stations)
        setError(null)
      }
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err : new Error('Telemetry tick failed'))
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void runTick()
    const handle = setInterval(() => void runTick(), TICK_INTERVAL_MS)
    return () => {
      mountedRef.current = false
      clearInterval(handle)
    }
  }, [runTick])

  const refresh = useCallback(async () => {
    const result = await api.telemetry()
    setStations(result.stations)
  }, [])

  return { stations, error, refresh }
}
