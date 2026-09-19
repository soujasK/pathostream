import { useMemo } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { HistoryPoint, StationInfo } from '../../api/types'

const STATION_COLORS = ['#0f766e', '#2563eb', '#7c3aed', '#c026d3', '#ea580c', '#65a30d']

interface CciTrendChartProps {
  history: HistoryPoint[]
  stations: StationInfo[]
  biohazardThreshold: number
}

interface ChartRow {
  tick: number
  [stationId: string]: number
}

export function CciTrendChart({ history, stations, biohazardThreshold }: CciTrendChartProps) {
  const { rows, stationIds } = useMemo(() => {
    const byTick = new Map<number, ChartRow>()
    for (const point of history) {
      const row = byTick.get(point.tick) ?? { tick: point.tick }
      row[point.station_id] = Math.round(point.cci * 100) / 100
      byTick.set(point.tick, row)
    }
    return {
      rows: Array.from(byTick.values()).sort((a, b) => a.tick - b.tick),
      stationIds: stations.map((s) => s.station_id),
    }
  }, [history, stations])

  if (rows.length < 2) {
    return (
      <p className="py-8 text-center text-sm text-ink-muted">
        Catchment Contamination Index trend will appear here after a couple of readings.
      </p>
    )
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="tick" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={36} />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              fontSize: 12,
              boxShadow: '0 4px 6px -1px rgb(15 23 42 / 0.08)',
            }}
            labelFormatter={(tick) => `Reading #${tick}`}
          />
          <ReferenceLine
            y={biohazardThreshold}
            stroke="#dc2626"
            strokeDasharray="4 4"
            label={{ value: 'Biohazard threshold', position: 'insideTopRight', fontSize: 10, fill: '#dc2626' }}
          />
          {stationIds.map((stationId, index) => (
            <Line
              key={stationId}
              type="monotone"
              dataKey={stationId}
              stroke={STATION_COLORS[index % STATION_COLORS.length]}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
