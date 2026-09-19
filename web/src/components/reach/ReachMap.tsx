import * as maplibregl from 'maplibre-gl'
import { useEffect, useRef } from 'react'
import type { NetworkStation, StationEvaluation } from '../../api/types'

const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm', paint: { 'raster-opacity': 0.9 } }],
}

const CRITICAL = '#dc2626'
const WARNING = '#d97706'
const HEALTHY = '#2563eb'

function stationColor(evaluation: StationEvaluation | undefined): string {
  if (!evaluation) return HEALTHY
  if (evaluation.isOwnFlag || evaluation.phase === 'confirmed') return CRITICAL
  if (evaluation.phase === 'predicted') return WARNING
  return HEALTHY
}

function shouldPulse(evaluation: StationEvaluation | undefined): boolean {
  if (!evaluation) return false
  return evaluation.isOwnFlag || evaluation.phase === 'predicted' || evaluation.phase === 'confirmed'
}

interface ReachMapProps {
  stations: NetworkStation[]
  evaluations: StationEvaluation[]
  selectedStationId: string | undefined
  onSelectStation: (stationId: string) => void
}

export function ReachMap({ stations, evaluations, selectedStationId, onSelectStation }: ReachMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const hasFitRef = useRef(false)
  const stationsDataRef = useRef<GeoJSON.FeatureCollection>({ type: 'FeatureCollection', features: [] })
  const onSelectStationRef = useRef(onSelectStation)
  onSelectStationRef.current = onSelectStation
  const evaluationByStation = new Map(evaluations.map((e) => [e.stationId, e]))

  useEffect(() => {
    if (!containerRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [-8.435, 40.212],
      zoom: 13.5,
      attributionControl: { compact: true },
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map

    let animationFrame: number
    map.on('load', () => {
      map.addSource('flow-line', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'flow-line',
        type: 'line',
        source: 'flow-line',
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': '#94a3b8', 'line-width': 2.5, 'line-dasharray': [0.2, 1.6] },
      })

      map.addSource('stations', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'station-halo',
        type: 'circle',
        source: 'stations',
        filter: ['==', ['get', 'shouldPulse'], true],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['coalesce', ['feature-state', 'pulse'], 0], 0, 9, 1, 24],
          'circle-color': ['get', 'color'],
          'circle-opacity': ['interpolate', ['linear'], ['coalesce', ['feature-state', 'pulse'], 0], 0, 0.35, 1, 0],
        },
      })
      map.addLayer({
        id: 'station-core',
        type: 'circle',
        source: 'stations',
        paint: {
          'circle-radius': ['case', ['==', ['get', 'selected'], true], 9, 7],
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      })
      map.addLayer({
        id: 'station-label',
        type: 'symbol',
        source: 'stations',
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 10,
          'text-offset': [0, 1.3],
          'text-anchor': 'top',
          'text-font': ['Noto Sans Regular'],
        },
        paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 },
      })

      map.on('mouseenter', 'station-core', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'station-core', () => {
        map.getCanvas().style.cursor = ''
      })
      map.on('click', 'station-core', (e) => {
        const stationId = e.features?.[0]?.properties?.stationId as string | undefined
        if (stationId) onSelectStationRef.current(stationId)
      })

      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 })
      map.on('mousemove', 'station-core', (e) => {
        const feature = e.features?.[0]
        if (!feature) return
        const { name, status } = feature.properties as { name: string; status: string }
        const geometry = feature.geometry as GeoJSON.Point
        popup
          .setLngLat(geometry.coordinates as [number, number])
          .setHTML(
            `<div style="font:600 12px -apple-system,sans-serif;color:#0f172a;">${name}</div>` +
              `<div style="font:11px -apple-system,sans-serif;color:#475569;margin-top:2px;">${status}</div>`,
          )
          .addTo(map)
      })
      map.on('mouseleave', 'station-core', () => popup.remove())

      const start = performance.now()
      const animate = (now: number) => {
        const elapsed = ((now - start) % 1800) / 1800
        for (const feature of stationsDataRef.current.features) {
          if (feature.properties?.shouldPulse) {
            map.setFeatureState({ source: 'stations', id: feature.id as number }, { pulse: elapsed })
          }
        }
        animationFrame = requestAnimationFrame(animate)
      }
      animationFrame = requestAnimationFrame(animate)
    })

    return () => {
      cancelAnimationFrame(animationFrame)
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || stations.length === 0) return

    const lineGeojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: stations.map((s) => [s.longitude, s.latitude]) },
        },
      ],
    }
    const stationsGeojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: stations.map((station, index) => {
        const evaluation = evaluationByStation.get(station.id)
        const status = evaluation
          ? evaluation.isOwnFlag
            ? 'Biohazard active (confirmed)'
            : evaluation.phase === 'confirmed'
              ? 'Active exposure window'
              : evaluation.phase === 'predicted'
                ? 'Predicted arrival'
                : 'Plume cleared'
          : 'Healthy'
        return {
          type: 'Feature',
          id: index,
          properties: {
            stationId: station.id,
            name: station.name,
            status,
            color: stationColor(evaluation),
            shouldPulse: shouldPulse(evaluation),
            selected: station.id === selectedStationId,
          },
          geometry: { type: 'Point', coordinates: [station.longitude, station.latitude] },
        }
      }),
    }

    stationsDataRef.current = stationsGeojson
    const apply = () => {
      ;(map.getSource('flow-line') as maplibregl.GeoJSONSource | undefined)?.setData(lineGeojson)
      ;(map.getSource('stations') as maplibregl.GeoJSONSource | undefined)?.setData(stationsGeojson)
      if (!hasFitRef.current) {
        const bounds = new maplibregl.LngLatBounds()
        for (const s of stations) bounds.extend([s.longitude, s.latitude])
        map.fitBounds(bounds, { padding: 64, duration: 0 })
        hasFitRef.current = true
      }
    }
    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stations, evaluations, selectedStationId])

  return <div ref={containerRef} className="h-full w-full rounded-xl" />
}
