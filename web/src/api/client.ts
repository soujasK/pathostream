import type { CatchmentBoundary, CdsHookResponse, DemoConfig, DemoTickResponse, StationInfo } from './types'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

class ApiError extends Error {
  status: number
  path: string

  constructor(status: number, path: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.path = path
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new ApiError(res.status, path, `${init?.method ?? 'GET'} ${path} -> ${res.status}: ${body}`)
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

export interface PatientViewParams {
  station: StationInfo
  betaLactamAllergy: boolean
  renalImpairment: boolean
}

/** Builds a CDS Hooks patient-view request. Only the FHIR *shape* is
 * constructed client-side (a standard geolocation extension, an
 * AllergyIntolerance/Condition toggle); no clinical values are invented --
 * this mirrors exactly what ui/dashboard.py and tests/test_cds_hooks.py send. */
function buildPatientViewRequest(params: PatientViewParams) {
  return {
    hookInstance: crypto.randomUUID(),
    hook: 'patient-view' as const,
    context: { userId: 'Practitioner/demo-md', patientId: 'demo-patient' },
    prefetch: {
      patient: {
        resourceType: 'Patient',
        id: 'demo-patient',
        address: [{ extension: [geolocationExtension(params.station.latitude, params.station.longitude)] }],
      },
      allergies: {
        resourceType: 'Bundle',
        entry: params.betaLactamAllergy
          ? [
              {
                resource: {
                  resourceType: 'AllergyIntolerance',
                  code: { text: 'Penicillin' },
                  reaction: [{ severity: 'severe' }],
                },
              },
            ]
          : [],
      },
      conditions: {
        resourceType: 'Bundle',
        entry: params.renalImpairment
          ? [{ resource: { resourceType: 'Condition', code: { text: 'Chronic kidney disease' } } }]
          : [],
      },
    },
  }
}

export const api = {
  config: () => request<DemoConfig>('/demo/config'),
  stations: () => request<StationInfo[]>('/demo/stations'),
  catchmentBoundary: () => request<CatchmentBoundary>('/demo/catchment-boundary'),
  tick: (breachedStationIds: string[]) =>
    request<DemoTickResponse>('/demo/tick', {
      method: 'POST',
      body: JSON.stringify({ breached_station_ids: breachedStationIds }),
    }),
  reset: () => request<{ status: string }>('/demo/reset', { method: 'POST' }),
  patientView: (params: PatientViewParams) =>
    request<CdsHookResponse>('/cds-services/patient-view', {
      method: 'POST',
      body: JSON.stringify(buildPatientViewRequest(params)),
    }),
}

export { ApiError }
