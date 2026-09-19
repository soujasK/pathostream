import type {
  CdsHookResponse,
  DemoForecastsResponse,
  DemoStateResponse,
  NetworkStation,
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

export const api = {
  stations: () => request<NetworkStation[]>('/demo/stations'),
  state: () => request<DemoStateResponse>('/demo/state'),
  forecasts: () => request<DemoForecastsResponse>('/demo/forecasts'),
  simulate: (params: { stationId: string; flagged: boolean; severityIndex?: number; elapsedMinutes?: number }) =>
    request<StationState>('/demo/simulate', { method: 'POST', body: JSON.stringify(params) }),
  reset: () => request<{ status: string }>('/demo/reset', { method: 'POST' }),
  patientView: (station: NetworkStation) =>
    request<CdsHookResponse>('/cds-services/patient-view', {
      method: 'POST',
      body: JSON.stringify(buildPatientViewRequest(station)),
    }),
}
