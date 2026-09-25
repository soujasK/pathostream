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
  layers: [{ id: 'osm', type: 'raster', source: 'osm', paint: { 'raster-opacity': 0.75 } }],
}

const CRITICAL = '#dc2626'
const WARNING = '#d97706'
const HEALTHY = '#2563eb'

function statusOf(evaluation: StationEvaluation | undefined): { color: string; text: string } {
  if (!evaluation) return { color: HEALTHY, text: 'Healthy' }
  if (evaluation.isOwnFlag) return { color: CRITICAL, text: 'Contamination confirmed' }
  if (evaluation.phase === 'confirmed') return { color: CRITICAL, text: 'Active exposure window' }
  if (evaluation.phase === 'predicted') return { color: WARNING, text: 'Predicted arrival' }
  return { color: HEALTHY, text: 'Plume cleared' }
}

export interface EuropeMapRiver {
  id: string
  label: string
  stations: NetworkStation[]
  evaluations: StationEvaluation[]
}

interface EuropeMapProps {
  rivers: EuropeMapRiver[]
  activeId: string
  onSelect: (riverId: string) => void
}

/** Every monitored river on one map. River lines are schematic straight
 * segments between stations (NOT the rivers' real courses); station dots
 * are real, verified places colored by live exposure status. Clicking a
 * river or station selects it. */
export function EuropeMap({ rivers, activeId, onSelect }: EuropeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const hasFitRef = useRef(false)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    if (!containerRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [11, 47],
      zoom: 3.3,
      attributionControl: { compact: true },
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map

    map.on('load', () => {
      map.addSource('rivers', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addSource('stations', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'river-hit',
        type: 'line',
        source: 'rivers',
        paint: { 'line-color': '#000000', 'line-opacity': 0, 'line-width': 16 },
      })
      map.addLayer({
        id: 'river-line',
        type: 'line',
        source: 'rivers',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['case', ['==', ['get', 'active'], true], '#002970', '#00baf2'],
          'line-width': ['case', ['==', ['get', 'active'], true], 4.5, 2.5],
        },
      })
      map.addLayer({
        id: 'station-core',
        type: 'circle',
        source: 'stations',
        paint: {
          'circle-radius': ['case', ['==', ['get', 'active'], true], 6.5, 4.5],
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
        },
      })

      for (const layer of ['river-hit', 'station-core']) {
        map.on('mouseenter', layer, () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', layer, () => {
          map.getCanvas().style.cursor = ''
        })
        map.on('click', layer, (e) => {
          const riverId = e.features?.[0]?.properties?.riverId as string | undefined
          if (riverId) onSelectRef.current(riverId)
        })
      }

      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 })
      map.on('mousemove', 'station-core', (e) => {
        const feature = e.features?.[0]
        if (!feature) return
        const { name, river, status, country } = feature.properties as {
          name: string
          river: string
          status: string
          country: string
        }
        const geometry = feature.geometry as GeoJSON.Point
        popup
          .setLngLat(geometry.coordinates as [number, number])
          .setHTML(
            `<div style="font:600 12px -apple-system,sans-serif;color:#0f172a;">${name}${country ? ` (${country})` : ''}</div>` +
              `<div style="font:11px -apple-system,sans-serif;color:#475569;margin-top:2px;">${river} &middot; ${status}</div>`,
          )
          .addTo(map)
      })
      map.on('mouseleave', 'station-core', () => popup.remove())
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || rivers.every((r) => r.stations.length === 0)) return

    const riverFeatures: GeoJSON.Feature[] = rivers
      .filter((r) => r.stations.length > 1)
      .map((r) => ({
        type: 'Feature',
        properties: { riverId: r.id, active: r.id === activeId },
        geometry: { type: 'LineString', coordinates: r.stations.map((s) => [s.longitude, s.latitude]) },
      }))

    const stationFeatures: GeoJSON.Feature[] = rivers.flatMap((r) => {
      const byStation = new Map(r.evaluations.map((e) => [e.stationId, e]))
      return r.stations.map((s) => {
        const status = statusOf(byStation.get(s.id))
        return {
          type: 'Feature' as const,
          properties: {
            riverId: r.id,
            river: r.label,
            name: s.name,
            country: s.country ?? '',
            status: status.text,
            color: status.color,
            active: r.id === activeId,
          },
          geometry: { type: 'Point' as const, coordinates: [s.longitude, s.latitude] },
        }
      })
    })

    const apply = () => {
      ;(map.getSource('rivers') as maplibregl.GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: riverFeatures,
      })
      ;(map.getSource('stations') as maplibregl.GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: stationFeatures,
      })
      // Fit only once every river has loaded, or a slow one would fall
      // outside a view fitted to the first rivers to arrive.
      if (!hasFitRef.current && rivers.every((r) => r.stations.length > 0)) {
        const bounds = new maplibregl.LngLatBounds()
        for (const r of rivers) for (const s of r.stations) bounds.extend([s.longitude, s.latitude])
        map.fitBounds(bounds, { padding: 40, duration: 0 })
        hasFitRef.current = true
      }
    }
    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
  }, [rivers, activeId])

  return <div ref={containerRef} className="h-full w-full rounded-xl" />
}
