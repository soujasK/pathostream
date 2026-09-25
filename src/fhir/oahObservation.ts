/**
 * Citizen water reports as FHIR R4 resources in the shape of the HL7 Europe
 * OneAquaHealth (OAH) FHIR IG (github.com/hl7-eu/oah, canonical
 * http://hl7.eu/fhir/ig/oah -- an unballoted CI-build draft).
 *
 * Profiles used, read directly from the IG's FSH source:
 *  - `observation-indicators-oah` ("Observation: OAH Indicators"): status
 *    fixed to final; code 1.. (preferred binding to the OAH non-health
 *    indicator value set); subject 1.. a LocationOah; effective[x] 1..;
 *    performer 1..; component value[x] 1.. and only CodeableConcept, string
 *    or Quantity.
 *  - `location-oah`: identifier 1.., name 1.., mode fixed to instance,
 *    position with both latitude and longitude.
 *
 * NOT used: `observation-with-component-oah`. It is the IG's macrophytes
 * (aquatic plants) profile, with required bindings to plant-indicator
 * value sets; a citizen checklist is not a macrophyte survey, so claiming
 * it would be false.
 *
 * Coding choices: the IG's own indicator `foam` ("Foam/colour/smell") is
 * used for the checklist items it covers (foam, colour, smell). Dead
 * wildlife and the 1-5 clarity rating have no matching OAH indicator, so
 * they carry text only -- allowed by the preferred binding, and more honest
 * than borrowing a code with a different meaning.
 *
 * Conformance is checked with the official HL7 validator against the IG's
 * compiled profiles (conformance/README.md, "OneAquaHealth IG profiles").
 */

import type { CitizenObservation } from "../citizen/observations.js";
import type { NetworkStation } from "../data/networkTypes.js";
import { nameBasedUuid } from "./bundle.js";

export const OAH_CANONICAL = "http://hl7.eu/fhir/ig/oah";
export const OAH_OBSERVATION_PROFILE = `${OAH_CANONICAL}/StructureDefinition/observation-indicators-oah`;
export const OAH_LOCATION_PROFILE = `${OAH_CANONICAL}/StructureDefinition/location-oah`;
/** The IG's "Temporary OAH Code System" (id temporarySystem-oah-eu). */
export const OAH_INDICATOR_SYSTEM = `${OAH_CANONICAL}/CodeSystem/temporarySystem-oah-eu`;

/** This project's own identifier namespace for stations -- deliberately not
 * the OAH project's (https://oneaquahealth.eu/location-id), which is theirs
 * to assign. */
export const STATION_IDENTIFIER_SYSTEM = "https://github.com/soujasK/pathostream/station-id";

const OBSERVATION_CATEGORY_SYSTEM = "http://terminology.hl7.org/CodeSystem/observation-category";
const YES_NO_SYSTEM = "http://terminology.hl7.org/CodeSystem/v2-0136";

interface Coding { system: string; code: string; display?: string }
interface CodeableConcept { coding?: Coding[]; text?: string }

export interface OahLocation {
  resourceType: "Location";
  id: string;
  meta: { profile: string[] };
  text: { status: "generated"; div: string };
  identifier: Array<{ system: string; value: string }>;
  name: string;
  mode: "instance";
  position: { longitude: number; latitude: number };
}

export interface OahObservation {
  resourceType: "Observation";
  id: string;
  meta: { profile: string[] };
  text: { status: "generated"; div: string };
  status: "final";
  category: CodeableConcept[];
  code: CodeableConcept;
  subject: { reference: string; display: string };
  effectiveDateTime: string;
  performer: Array<{ display: string }>;
  component: Array<{
    code: CodeableConcept;
    valueCodeableConcept?: CodeableConcept;
    valueQuantity?: { value: number; unit: string };
  }>;
  note: Array<{ text: string }>;
}

const FOAM_COLOUR_SMELL: Coding = { system: OAH_INDICATOR_SYSTEM, code: "foam", display: "Foam/colour/smell" };

function yesNo(value: boolean): CodeableConcept {
  return { coding: [{ system: YES_NO_SYSTEM, code: value ? "Y" : "N", display: value ? "Yes" : "No" }] };
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function narrative(lines: string[]) {
  return {
    status: "generated" as const,
    div: `<div xmlns="http://www.w3.org/1999/xhtml">${lines.map((l) => `<p>${escapeXml(l)}</p>`).join("")}</div>`,
  };
}

/** The in-bundle identity of a station's Location (see collectionBundle). */
export function locationFullUrl(stationId: string): string {
  return `urn:uuid:${nameBasedUuid(`Location/${stationId}`)}`;
}

export function buildOahLocation(station: NetworkStation): OahLocation {
  return {
    resourceType: "Location",
    id: station.id,
    meta: { profile: [OAH_LOCATION_PROFILE] },
    text: narrative([`Monitoring station ${station.name} (${station.id}), ${station.latitude}, ${station.longitude}.`]),
    identifier: [{ system: STATION_IDENTIFIER_SYSTEM, value: station.id }],
    name: station.name,
    mode: "instance",
    position: { longitude: station.longitude, latitude: station.latitude },
  };
}

export function buildCitizenOahObservation(observation: CitizenObservation, station: NetworkStation): OahObservation {
  const { input } = observation;
  const concern = Math.round(observation.triage.probability * 100);
  const reviewNote =
    `Review status: ${observation.status}. AI triage: ${concern}% concern -- a recommendation for human review, ` +
    "not a confirmation. Only a water-authority reviewer's promotion makes this report count as confirmed.";

  return {
    resourceType: "Observation",
    id: observation.id,
    meta: { profile: [OAH_OBSERVATION_PROFILE] },
    text: narrative([
      `Citizen visual water check at ${station.name}, ${observation.submittedAt}.`,
      `Clarity ${input.clarityScore}/5; foam ${input.foam ? "yes" : "no"}; unusual colour ${input.discoloration ? "yes" : "no"}; ` +
        `unusual smell ${input.unusualOdor ? "yes" : "no"}; dead fish or wildlife ${input.deadWildlife ? "yes" : "no"}.`,
      reviewNote,
    ]),
    status: "final",
    category: [{ coding: [{ system: OBSERVATION_CATEGORY_SYSTEM, code: "survey", display: "Survey" }] }],
    code: { coding: [FOAM_COLOUR_SMELL], text: "Citizen visual water check (structured checklist)" },
    subject: { reference: locationFullUrl(station.id), display: station.name },
    effectiveDateTime: observation.submittedAt,
    performer: [{ display: "Anonymous citizen observer" }],
    component: [
      { code: { coding: [FOAM_COLOUR_SMELL], text: "Foam on the water surface" }, valueCodeableConcept: yesNo(input.foam) },
      { code: { coding: [FOAM_COLOUR_SMELL], text: "Unusual water colour" }, valueCodeableConcept: yesNo(input.discoloration) },
      { code: { coding: [FOAM_COLOUR_SMELL], text: "Unusual smell" }, valueCodeableConcept: yesNo(input.unusualOdor) },
      { code: { text: "Dead fish or wildlife seen" }, valueCodeableConcept: yesNo(input.deadWildlife) },
      {
        code: { text: "Water clarity, citizen-rated (1 = very cloudy, 5 = very clear)" },
        // A plain rating, not a unit of measure: no UCUM code (the HL7
        // validator discourages annotation codes like {score}).
        valueQuantity: { value: input.clarityScore, unit: "rating (1-5)" },
      },
    ],
    note: [{ text: reviewNote }],
  };
}

/** A collection Bundle: the station's Location plus the report, with the
 * Observation's subject resolving to the Location inside the Bundle. */
export function citizenObservationBundle(observation: CitizenObservation, station: NetworkStation) {
  const location = buildOahLocation(station);
  const obs = buildCitizenOahObservation(observation, station);
  return {
    resourceType: "Bundle" as const,
    type: "collection" as const,
    entry: [
      { fullUrl: locationFullUrl(station.id), resource: location },
      { fullUrl: `urn:uuid:${nameBasedUuid(`Observation/${obs.id}`)}`, resource: obs },
    ],
  };
}
