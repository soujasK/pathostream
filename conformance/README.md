# FHIR conformance check

The FHIR resources this service emits were validated with the **official HL7 FHIR Validator**, not just asserted to be "R4-shaped".

## Reproduce

```bash
npx tsx scripts/exportFhirSamples.ts        # writes conformance/samples/*.json from the real server code
# validator_cli.jar: https://github.com/hapifhir/org.hl7.fhir.core/releases (needs Java)
java -jar validator_cli.jar conformance/samples/forecast-bundle.json conformance/samples/service-request.json -version 4.0.1
```

The first run downloads the FHIR core and terminology packages (several minutes); it then contacts the public terminology server (tx.fhir.org).

## Result (validator 6.10.4, FHIR 4.0.1, terminology server tx.fhir.org)

| Resource | First run | After fixes |
|---|---|---|
| Bundle (5 × RiskAssessment) | **20 errors**, 5 warnings, 5 info | **0 errors, 0 warnings**, 5 info |
| ServiceRequest (proposed by the card) | **1 error**, 1 warning | **0 errors**, 1 warning |

**What the first run found** (all real defects in the earlier "base-R4-conformant" claim, which had never been machine-checked):

1. Every Bundle entry lacked `fullUrl` -- required for a `collection` Bundle, and it also invalidated the relative references inside each resource (20 errors from one root cause). *Fixed:* deterministic `urn:uuid:` fullUrl per entry (`src/fhir/bundle.ts`).
2. RiskAssessments had no narrative (`dom-6`, best practice). *Fixed:* generated XHTML narrative.
3. The proposed `ServiceRequest` had no `subject` (1..1 in R4). *Fixed:* taken from the hook context; if no patient id is available, no order is proposed at all rather than an invalid one.

Each is pinned by a regression test (`test/fhir.test.ts`, `test/cdsHooks.test.ts`) so it is caught in CI without Java.

**Remaining, and why:**

- 5 × *information*: "Binding for path `RiskAssessment.prediction.outcome` ... has no source, so can't be checked". The R4 base element has no required terminology binding; nothing is wrong.
- 1 × *warning* on the ServiceRequest: `dom-6` narrative. It is a draft resource proposed inside a CDS Hooks suggestion, not a stored record.

## What this does and does not establish

- It establishes **base FHIR R4 structural conformance** of these resources.
- It does **not** establish conformance to any profile: no `meta.profile` is claimed. The HL7 Europe OneAquaHealth IG defines an Observation profile we could confirm, but no RiskAssessment profile (see `src/fhir/riskAssessment.ts`).
- It does **not** validate the CDS Hooks JSON (cards, discovery) -- that is not FHIR; card constraints are checked in `test/cdsHooks.test.ts` against the CDS Hooks 2.0 text.
- The terminology server checks codes that have a value-set binding; the SNOMED CT (77377001) and LOINC (82195-9) codes were verified against their code systems in earlier work (README, "Verified codes").
