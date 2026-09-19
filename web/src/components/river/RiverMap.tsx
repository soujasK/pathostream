import * as maplibregl from 'maplibre-gl'
import { useEffect, useRef } from 'react'
import type { CatchmentBoundary, ForecastEntry, StationInfo, StationReading } from '../../api/types'
import { SEVERITY_HEX } from '../../lib/severity'

const FORECAST_COLOR = '#d97706'

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

const CENTER: [number, number] = [72.875, 19.08]

function stationsToGeoJson(
  stations: StationInfo[],
  readingByStation: Map<string, StationReading>,
  forecastTargetIds: Set<string>,
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: stations.map((station, index) => {
      const reading = readingByStation.get(station.station_id)
      const flagged = reading?.biohazard_flag_active ?? false
      return {
        type: 'Feature',
        id: index,
        properties: {
          station_id: station.station_id,
          flagged,
          forecastTarget: !flagged && forecastTargetIds.has(station.station_id),
          cci: reading ? Math.round(reading.cci * 10) / 10 : null,
        },
        geometry: { type: 'Point', coordinates: [station.longitude, station.latitude] },
      }
    }),
  }
}

function forecastsToGeoJson(forecasts: ForecastEntry[], stations: StationInfo[]): GeoJSON.FeatureCollection {
  const byId = new Map(stations.map((s) => [s.station_id, s]))
  const features: GeoJSON.Feature[] = []
  for (const forecast of forecasts) {
    const source = byId.get(forecast.source_station_id)
    const target = byId.get(forecast.target_station_id)
    if (!source || !target) continue
    features.push({
      type: 'Feature',
      properties: { eta_minutes: forecast.eta_minutes },
      geometry: {
        type: 'LineString',
        coordinates: [
          [source.longitude, source.latitude],
          [target.longitude, target.latitude],
        ],
      },
    })
  }
  return { type: 'FeatureCollection', features }
}

interface RiverMapProps {
  stations: StationInfo[]
  readings: StationReading[]
  forecasts: ForecastEntry[]
  boundary: CatchmentBoundary | undefined
  selectedStationId: string | undefined
  onSelectStation: (stationId: string) => void
}

export function RiverMap({
  stations,
  readings,
  forecasts,
  boundary,
  selectedStationId,
  onSelectStation,
}: RiverMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const onSelectStationRef = useRef(onSelectStation)
  onSelectStationRef.current = onSelectStation
  // Read by the rAF pulse loop below; kept out of MapLibre's private
  // internals (no reaching into `source._data`) so it survives library
  // upgrades.
  const stationsDataRef = useRef<GeoJSON.FeatureCollection>({ type: 'FeatureCollection', features: [] })
  const readingByStation = new Map(readings.map((r) => [r.station_id, r]))
  const forecastTargetIds = new Set(forecasts.map((f) => f.target_station_id))

  // Mount the map once.
  useEffect(() => {
    if (!containerRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: CENTER,
      zoom: 12.3,
      attributionControl: { compact: true },
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map

    let animationFrame: number
    map.on('load', () => {
      map.addSource('catchment', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'catchment-fill',
        type: 'fill',
        source: 'catchment',
        paint: { 'fill-color': '#0f766e', 'fill-opacity': 0.08 },
      })
      map.addLayer({
        id: 'catchment-line',
        type: 'line',
        source: 'catchment',
        paint: { 'line-color': '#0f766e', 'line-width': 1.5, 'line-dasharray': [2, 2] },
      })

      map.addSource('forecast-lines', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'forecast-line',
        type: 'line',
        source: 'forecast-lines',
        layout: { 'line-cap': 'round' },
        paint: {
          'line-color': FORECAST_COLOR,
          'line-width': 2.5,
          'line-dasharray': [0.2, 1.6],
          'line-opacity': 0.85,
        },
      })

      map.addSource('stations', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      // Halo rings, pulsed via feature-state so only cheap per-frame paint
      // updates happen -- no GeoJSON re-parsing on every animation tick.
      // Two layers share the same `pulse` state: red for a CONFIRMED flag,
      // amber for a PREDICTED (not yet confirmed) downstream arrival.
      const haloPaint = (color: string): maplibregl.CircleLayerSpecification['paint'] => ({
        // `coalesce` avoids a "found null instead" console warning for the
        // brief window before the pulse loop's first setFeatureState call.
        'circle-radius': ['interpolate', ['linear'], ['coalesce', ['feature-state', 'pulse'], 0], 0, 10, 1, 26],
        'circle-color': color,
        'circle-opacity': ['interpolate', ['linear'], ['coalesce', ['feature-state', 'pulse'], 0], 0, 0.35, 1, 0],
      })
      map.addLayer({
        id: 'station-halo-forecast',
        type: 'circle',
        source: 'stations',
        filter: ['==', ['get', 'forecastTarget'], true],
        paint: haloPaint(FORECAST_COLOR),
      })
      map.addLayer({
        id: 'station-halo',
        type: 'circle',
        source: 'stations',
        filter: ['==', ['get', 'flagged'], true],
        paint: haloPaint('#dc2626'),
      })
      map.addLayer({
        id: 'station-core',
        type: 'circle',
        source: 'stations',
        paint: {
          'circle-radius': ['case', ['==', ['get', 'flagged'], true], 9, 7],
          'circle-color': [
            'case',
            ['==', ['get', 'flagged'], true],
            SEVERITY_HEX.critical,
            ['==', ['get', 'forecastTarget'], true],
            FORECAST_COLOR,
            SEVERITY_HEX.healthy,
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      })
      map.addLayer({
        id: 'station-label',
        type: 'symbol',
        source: 'stations',
        layout: {
          'text-field': ['get', 'station_id'],
          'text-size': 11,
          'text-offset': [0, 1.4],
          'text-anchor': 'top',
          'text-font': ['Noto Sans Regular'],
        },
        paint: {
          'text-color': '#0f172a',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.4,
        },
      })

      map.on('mouseenter', 'station-core', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'station-core', () => {
        map.getCanvas().style.cursor = ''
      })
      map.on('click', 'station-core', (e) => {
        const stationId = e.features?.[0]?.properties?.station_id as string | undefined
        if (stationId) onSelectStationRef.current(stationId)
      })

      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14 })
      map.on('mousemove', 'station-core', (e) => {
        const feature = e.features?.[0]
        if (!feature) return
        const { station_id, cci, flagged, forecastTarget } = feature.properties as {
          station_id: string
          cci: number | null
          flagged: boolean
          forecastTarget: boolean
        }
        const geometry = feature.geometry as GeoJSON.Point
        const color = flagged ? '#dc2626' : forecastTarget ? FORECAST_COLOR : '#059669'
        const label = flagged ? 'Biohazard active' : forecastTarget ? 'Predicted arrival (not yet confirmed)' : 'Healthy'
        popup
          .setLngLat(geometry.coordinates as [number, number])
          .setHTML(
            `<div style="font:600 12px -apple-system,sans-serif;color:#0f172a;">${station_id}</div>` +
              `<div style="font:11px -apple-system,sans-serif;color:${color};margin-top:2px;">` +
              `${label}${cci !== null ? ` &middot; CCI ${cci}` : ''}</div>`,
          )
          .addTo(map)
      })
      map.on('mouseleave', 'station-core', () => popup.remove())

      // Animate the pulse ring for every currently-flagged OR
      // forecast-target feature.
      const start = performance.now()
      const animate = (now: number) => {
        const elapsed = ((now - start) % 1800) / 1800
        for (const feature of stationsDataRef.current.features) {
          if (feature.properties?.flagged || feature.properties?.forecastTarget) {
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

  // Push the catchment boundary in once it's loaded.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !boundary) return
    const apply = () => {
      const source = map.getSource('catchment') as maplibregl.GeoJSONSource | undefined
      source?.setData(boundary as unknown as GeoJSON.FeatureCollection)
    }
    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
  }, [boundary])

  // Keep the station source (and the ref the pulse animation reads) in
  // sync with the latest readings.
  useEffect(() => {
    const map = mapRef.current
    if (!map || stations.length === 0) return
    const geojson = stationsToGeoJson(stations, readingByStation, forecastTargetIds)
    stationsDataRef.current = geojson
    const apply = () => {
      const source = map.getSource('stations') as maplibregl.GeoJSONSource | undefined
      source?.setData(geojson)
    }
    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stations, readings, forecasts])

  // Keep the source->target forecast lines in sync.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const geojson = forecastsToGeoJson(forecasts, stations)
    const apply = () => {
      const source = map.getSource('forecast-lines') as maplibregl.GeoJSONSource | undefined
      source?.setData(geojson)
    }
    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
  }, [forecasts, stations])

  // Fit every station in view once, the first time they load -- a cold
  // judge should see the whole monitored corridor before anything else.
  const hasFitRef = useRef(false)
  useEffect(() => {
    const map = mapRef.current
    if (!map || stations.length === 0 || hasFitRef.current) return
    const bounds = new maplibregl.LngLatBounds()
    for (const station of stations) bounds.extend([station.longitude, station.latitude])
    const apply = () => {
      map.fitBounds(bounds, { padding: 56, duration: 0 })
      hasFitRef.current = true
    }
    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
  }, [stations])

  // Highlight the selected station with a fly-to -- but skip the very
  // first selection (the default patient address), so it doesn't fight
  // the fit-all-stations view above on initial load.
  const isFirstSelectionRef = useRef(true)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !selectedStationId) return
    if (isFirstSelectionRef.current) {
      isFirstSelectionRef.current = false
      return
    }
    const station = stations.find((s) => s.station_id === selectedStationId)
    if (!station) return
    map.easeTo({ center: [station.longitude, station.latitude], zoom: Math.max(map.getZoom(), 13.5), duration: 700 })
  }, [selectedStationId, stations])

  return <div ref={containerRef} className="h-full w-full rounded-xl" />
}
