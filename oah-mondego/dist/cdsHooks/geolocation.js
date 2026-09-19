/** Extracts (lat, lon) from a FHIR Patient's standard `geolocation`
 * extension (http://hl7.org/fhir/StructureDefinition/geolocation) -- the
 * same extension shape the sibling Python service's
 * `cds_service.py::_extract_address` parses. */
const GEOLOCATION_EXTENSION_URL = "http://hl7.org/fhir/StructureDefinition/geolocation";
export function extractPatientAddress(patient) {
    const resource = patient;
    for (const address of resource?.address ?? []) {
        for (const extension of address.extension ?? []) {
            if (extension.url !== GEOLOCATION_EXTENSION_URL)
                continue;
            let latitude;
            let longitude;
            for (const sub of extension.extension ?? []) {
                if (sub.url === "latitude")
                    latitude = sub.valueDecimal;
                else if (sub.url === "longitude")
                    longitude = sub.valueDecimal;
            }
            if (latitude !== undefined && longitude !== undefined) {
                return { latitude, longitude };
            }
        }
    }
    return null;
}
const EARTH_RADIUS_KM = 6371.0088;
export function haversineKm(aLat, aLon, bLat, bLon) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(bLat - aLat);
    const dLon = toRad(bLon - aLon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}
