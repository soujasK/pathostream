import { useQuery } from '@tanstack/react-query'
import { api } from '../../api/client'

/** A small badge showing a LIVE reading from a real government API
 * (Germany's PEGELONLINE water-gauge network), for the ~5 stations that
 * have one. Deliberately visually distinct from the status pill next to
 * it (a plain gray border, a pulsing dot instead of a solid one, its own
 * "LIVE" word) and from the green/amber/red vocabulary the synthetic
 * detector uses -- this is water LEVEL, not turbidity, and has no
 * relationship to that station's contamination status. Renders nothing
 * for the ~28 stations with no match, so it adds no visual noise there. */
export function RealGaugeBadge({ stationId }: { stationId: string }) {
  const query = useQuery({
    queryKey: ['real-gauge', stationId],
    queryFn: () => api.realGauge(stationId),
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  })

  if (!query.data?.available) return null
  const g = query.data

  return (
    <span
      // Fixed width + its own truncate: a live reading's digit count varies
      // (e.g. "62 cm" vs "407 cm"), and this badge must never resize the
      // row around it -- see the comment on its parent row in StationsPanel.
      className="inline-flex w-[116px] shrink-0 items-center gap-1 truncate rounded-full border border-border bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-ink-muted"
      title={`Live water level from a real government gauge (${g.source}), ${g.stateMnwMhw ?? 'state unknown'} relative to normal. This is river LEVEL, not turbidity -- it is not part of the contamination detector. Measured ${new Date(g.measuredAt).toLocaleString()}.`}
    >
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-600" />
      </span>
      LIVE &middot; {g.waterLevelCm} cm
    </span>
  )
}
