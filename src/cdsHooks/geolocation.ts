/** Extracts (lat, lon) from a FHIR Patient's standard `geolocation`
 * extension (http://hl7.org/fhir/StructureDefinition/geolocation) -- the
 * same extension shape the sibling Python service's
 * `cds_service.py::_extract_address` parses. */

const GEOLOCATION_EXTENSION_URL = "http://hl7.org/fhir/StructureDefinition/geolocation";

export interface PatientAddress {
  latitude: number;
  longitude: number;
}

interface FhirExtension {
  url?: string;
  valueDecimal?: number;
  extension?: FhirExtension[];
}

interface FhirAddress {
  extension?: FhirExtension[];
}

interface FhirPatient {
  address?: FhirAddress[];
}

export function extractPatientAddress(patient: unknown): PatientAddress | null {
  const resource = patient as FhirPatient | undefined;
  for (const address of resource?.address ?? []) {
    for (const extension of address.extension ?? []) {
      if (extension.url !== GEOLOCATION_EXTENSION_URL) continue;
      let latitude: number | undefined;
      let longitude: number | undefined;
      for (const sub of extension.extension ?? []) {
        if (sub.url === "latitude") latitude = sub.valueDecimal;
        else if (sub.url === "longitude") longitude = sub.valueDecimal;
      }
      if (latitude !== undefined && longitude !== undefined) {
        return { latitude, longitude };
      }
    }
  }
  return null;
}

const EARTH_RADIUS_KM = 6371.0088;

export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}
