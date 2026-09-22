import type {
  CatchmentsResponse,
  CdsHookResponse,
  DemoForecastsResponse,
  DemoStateResponse,
  DemoTelemetryResponse,
  NetworkStation,
  RealGaugeResponse,
  StationState,
} from './types'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:4300'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${init?.method ?? 'GET'} ${path} -> ${res.status}: ${body}`)
  }
  return (await res.json()) as T
}

const GEOLOCATION_EXTENSION_URL = 'http://hl7.org/fhir/StructureDefinition/geolocation'

function geolocationExtension(latitude: number, longitude: number) {
  return {
    url: GEOLOCATION_EXTENSION_URL,
    extension: [
      { url: 'latitude', valueDecimal: latitude },
      { url: 'longitude', valueDecimal: longitude },
    ],
  }
}

/** Builds a patient-view request for a virtual patient at the given
 * network station -- only the FHIR extension *shape* is constructed
 * client-side, nothing fabricated beyond the demo's own simulated state. */
function buildPatientViewRequest(station: NetworkStation) {
  return {
    hookInstance: crypto.randomUUID(),
    hook: 'patient-view' as const,
    context: { userId: 'Practitioner/demo-md', patientId: 'demo-patient' },
    prefetch: {
      patient: {
        resourceType: 'Patient',
        id: 'demo-patient',
        address: [{ extension: [geolocationExtension(station.latitude, station.longitude)] }],
      },
    },
  }
}

/** A river's id from GET /demo/catchments (e.g. 'mondego', 'danube'). */
export type Catchment = string

/** The Mondego network kept its original un-prefixed /demo/* paths for
 * backward compatibility (see server.ts); every other river is served
 * under /demo/<id>/*. Every catchment-scoped call below takes the river
 * explicitly rather than defaulting, so a caller can never accidentally
 * mix two rivers' data. */
function catchmentPrefix(catchment: Catchment): string {
  return catchment === 'mondego' ? '/demo' : `/demo/${catchment}`
}

export const api = {
  catchments: () => request<CatchmentsResponse>('/demo/catchments'),
  stations: (catchment: Catchment) => request<NetworkStation[]>(`${catchmentPrefix(catchment)}/stations`),
  state: (catchment: Catchment) => request<DemoStateResponse>(`${catchmentPrefix(catchment)}/state`),
  forecasts: (catchment: Catchment) => request<DemoForecastsResponse>(`${catchmentPrefix(catchment)}/forecasts`),
  simulate: (
    catchment: Catchment,
    params: { stationId: string; flagged: boolean; severityIndex?: number; elapsedMinutes?: number },
  ) => request<StationState>(`${catchmentPrefix(catchment)}/simulate`, { method: 'POST', body: JSON.stringify(params) }),
  reset: (catchment: Catchment) => request<{ status: string }>(`${catchmentPrefix(catchment)}/reset`, { method: 'POST' }),
  telemetry: () => request<DemoTelemetryResponse>('/demo/telemetry'),
  telemetryTick: () => request<DemoTelemetryResponse>('/demo/telemetry/tick', { method: 'POST' }),
  telemetryInject: (stationId: string) =>
    request<{ status: string; stationId: string }>('/demo/telemetry/inject', {
      method: 'POST',
      body: JSON.stringify({ stationId }),
    }),
  telemetryClear: (stationId: string) =>
    request<{ status: string; stationId: string }>('/demo/telemetry/clear', {
      method: 'POST',
      body: JSON.stringify({ stationId }),
    }),
  patientView: (station: NetworkStation) =>
    request<CdsHookResponse>('/cds-services/patient-view', {
      method: 'POST',
      body: JSON.stringify(buildPatientViewRequest(station)),
    }),
  // Not catchment-scoped and not under /demo -- a real external reading,
  // independent of any river's simulated state.
  realGauge: (stationId: string) => request<RealGaugeResponse>(`/real-gauge/${stationId}`),
}
