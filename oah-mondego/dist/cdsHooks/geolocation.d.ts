/** Extracts (lat, lon) from a FHIR Patient's standard `geolocation`
 * extension (http://hl7.org/fhir/StructureDefinition/geolocation) -- the
 * same extension shape the sibling Python service's
 * `cds_service.py::_extract_address` parses. */
export interface PatientAddress {
    latitude: number;
    longitude: number;
}
export declare function extractPatientAddress(patient: unknown): PatientAddress | null;
export declare function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number;
