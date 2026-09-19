# OAH-Mondego (prototype)

A second, **independently implemented** case study for the OneAquaHealth
hackathon: downstream contamination-propagation forecasting across a real
**6-station monitoring network** along the Mondego River through Coimbra,
Portugal, serialized as real FHIR R4 `RiskAssessment.prediction` resources
and served over an Express CDS Hooks service.

**Why a second implementation exists at all:** the sibling Python service
in this repo (`app/`, `web/`) already does downstream propagation
forecasting for the Mithi River (Mumbai) and serializes it to FHIR. This
module reimplements the same *pattern* — advection-dispersion transport,
FHIR `RiskAssessment.prediction`, a CDS Hooks service — from scratch, in a
different language (TypeScript/Express instead of Python/FastAPI), against
a second real river. Two independent implementations producing the same
standards-conformant shape is the actual interoperability argument: the
FHIR/CDS-Hooks pattern generalizes because it's a *standard*, not because
of anything specific to one codebase.

**See `METHODS.md`** for the governing equations, parameter provenance,
and independent numerical validation behind the transport model -- the
research-methods-register companion to this operational README.

## ⚠️ Status — read this first

**Prototype only. Not validated hydrology, not a certified medical device,
not conformant to any official Portuguese WFD assessment.** See "What's
verified vs illustrative" below before citing any specific number from
this module.

## What's verified vs illustrative

| Claim | Status |
|---|---|
| LOINC `82195-9` ("Gastrointestinal pathogens DNA and RNA panel - Stool by NAA with non-probe detection") | **Verified** against loinc.org at build time. |
| SNOMED CT `77377001` ("Leptospirosis (disorder)") | **Verified** — reused from the sibling Python service's own corrected/verified code (see root `README.md`, "Code corrections"). |
| All 6 network station names (Ponte de Santa Clara, Parque Dr. Manuel Braga, Parque Verde do Mondego, Parque Choupalinho, Açude-Ponte, Mata Nacional do Choupal) | **Verified** — every station is a real, independently confirmed place on the Mondego in Coimbra (Wikipedia, Câmara Municipal de Coimbra, Tripadvisor/Lonely Planet). |
| Coordinates for Ponte de Santa Clara, Açude-Ponte, Mata Nacional do Choupal | **Verified** — sourced directly from a public reference (e.g. Wikipedia's infobox), independently fetched, not recalled. |
| Coordinates for Parque Dr. Manuel Braga, Parque Choupalinho | **Illustrative.** Names and real existence verified; no precise public geocode was found for either, so coordinates are estimated by interpolation from confirmed neighbors' positions — see `src/data/mondegoNetwork.ts`. |
| Upstream-to-downstream station order | **Illustrative.** Derived from sourced textual descriptions (e.g. Câmara Municipal de Coimbra: "Parque Manuel Braga extends... between Largo da Portagem... and Parque Verde do Mondego") plus the Mondego's real flow direction through Coimbra — not a surveyed hydrological flow-direction analysis. |
| Centro Hospitalar e Universitário de Coimbra (CHUC) is a real hospital serving Coimbra | **Verified** (Wikipedia, EATRIS, hospitaisonline.pt) — the largest hospital complex in Portugal. Used as realistic framing in CDS card copy (`src/data/mondegoNetwork.ts`'s `CHUC_ANCHOR`); this demo does **not** integrate with any real CHUC system. |
| A `RiskAssessment`-specific profile in the real HL7 Europe OAH FHIR IG (e.g. a "RiskAssessmentOah" StructureDefinition) | **Not independently verified.** The real IG (github.com/hl7-eu/oah) is confirmed to exist and is a CI-build draft, not published; we independently confirmed it defines an *Observation* profile (`observation-with-component-oah`, the same one the sibling Python service tags Observations with), but found no evidence of a RiskAssessment-specific profile. `buildForecastRiskAssessment` therefore emits plain base-R4 RiskAssessment resources without an OAH `meta.profile` claim — see that function's docstring in `src/fhir/riskAssessment.ts`. |
| Mean flow velocity (0.36 m/s, applied network-wide) | **Not independently verified.** No public river-gauge reading was available to check this against. Treated here as a documented, tunable, illustrative default — exactly like `PROPAGATION_FLOW_VELOCITY_M_S` in the sibling Python service's `app/core/propagation_engine.py`. Per-segment distances themselves are computed from each station pair's real (or estimated, per above) coordinates via the haversine formula, not assumed. |
| Longitudinal dispersion coefficient (8 m²/s default) | **Illustrative.** Within the typical literature range for small/medium urban channels (Fischer et al. 1979), not calibrated to the real Mondego. Configurable — see `AdvectionDispersionParams`. |
| The 1D advection-dispersion equation / Taylor-dispersion approximation (peak = x/u, σ_t² = 2Dx/u³) | **Real, standard transport theory** (Fischer, List, Koh, Imberger & Brooks, *Mixing in Inland and Coastal Waters*, 1979). Correctly implemented; see `src/hydrology/advectionDispersion.ts`. |
| The EU WFD 5-class EQR system (High/Good/Moderate/Poor/Bad) | **Real** regulatory structure. The specific numeric class boundaries used here are **illustrative**, not Portugal's official, type-specific, intercalibrated boundaries — see `src/hydrology/wfdClassification.ts`. |
| CDS Hooks 3.0.0 | **Ballot draft, not a published HL7 standard** at the time of writing (2.0.1 is the current official version). Implemented here at the project's explicit request; re-verify `order-select`'s shape against the final 3.0 release before any real deployment. |
| CQL rules in `src/cql/` | **Authored, valid CQL expressing the real exposure/stewardship logic** — not wired to a live CQL execution engine in this demo. The equivalent logic is *also* implemented directly in TypeScript (`exposureEngine.ts`, `orderSelect.ts`) so the running service doesn't depend on an engine that isn't here. See `src/cql/README.md`.
| "<35ms evaluation latency" | **Measured, not asserted.** `test/cdsHooks.test.ts` times `handlePatientView` directly (excluding HTTP/network overhead, which is a deployment concern, not a property of the logic) across 50 warmed-up calls. Measured: **~0.01ms average, ~0.015ms max** on this machine — see that test's console output. |
| Fischer (1979) / Liu (1977) dispersion-coefficient predictive equation (`D_L = 0.011 U²W²/(HU*)`) | **Real, independently confirmed** against two secondary sources reporting the same coefficient and form. Implemented in `src/hydrology/channelDispersion.ts`, available for real channel-geometry input; not used for the Mondego default because that geometry data doesn't exist for this case study. |
| The closed-form Taylor-dispersion approximation actually solves the governing PDE it approximates | **Independently checked**, not just asserted: `src/hydrology/numericalValidation.ts` solves the real 1D advection-dispersion PDE via finite differences and `test/numericalValidation.test.ts` confirms agreement (peak time within 10%, spread within 15%) at a representative Peclet number, with the residual discrepancy attributed to a specific, understood source (first-order-upwind numerical diffusion). See `METHODS.md` §4. |
| The leptospirosis/flooding clinical rationale | **Real, verified epidemiology** — Naing et al. (2019), *PLoS One* 14(5):e0217643 (PMID 31141558), pooled OR 2.19 for leptospirosis after flood exposure across 14 studies. Author names and journal details independently confirmed by fetching the PMC record directly. See `METHODS.md` §6. |

## Architecture

```
oah-mondego/
├── src/
│   ├── data/mondegoNetwork.ts       6-station network + flow order (see provenance notes above)
│   ├── hydrology/
│   │   ├── advectionDispersion.ts   1D transport model (arrival/peak/clearance/probability)
│   │   ├── channelDispersion.ts     Fischer (1979)/Liu (1977) dispersion-coefficient estimator
│   │   ├── propagation.ts           multi-station cascading forecast (flow-order walk)
│   │   ├── numericalValidation.ts   independent finite-difference PDE solver (validation only)
│   │   └── wfdClassification.ts     EU WFD EQR class mapping
│   ├── fhir/
│   │   ├── types.ts                 FHIR R4 types actually used here
│   │   └── riskAssessment.ts        Forecast -> RiskAssessment.prediction serializer
│   ├── cql/
│   │   └── exposureRules.cql        Authored computable exposure/stewardship rules
│   └── cdsHooks/
│       ├── types.ts                 CDS Hooks request/response shapes
│       ├── exposureEngine.ts        Per-station state + own-flag/downstream-forecast evaluation
│       ├── geolocation.ts           FHIR Patient geolocation extraction (shared)
│       ├── patientView.ts           patient-view hook handler (nearest-station resolution)
│       ├── orderSelect.ts           order-select stewardship-trigger handler
│       ├── discovery.ts             /cds-services manifest
│       └── server.ts                Express app + /demo/* scaffolding
├── test/                            63 tests: hydrology math, PDE validation, FHIR shape, CDS Hooks, exposure phases
└── web/                             React + Vite + Tailwind + MapLibre dashboard (the primary demo UI)
```

## Running it

```bash
cd oah-mondego
npm install

npm run dev     # API on http://127.0.0.1:4300, auto-reload
npm test        # 63 tests
npm run build   # tsc -> dist/

# Dashboard (separate terminal, needs the API running above)
cd web && npm install && npm run dev   # http://localhost:5174
```

The dashboard's "Simulator controls" panel can flag any of the 6 stations
and has a fast-forward, `elapsedMinutes` demo-speed control
(`POST /demo/simulate {stationId, flagged, severityIndex, elapsedMinutes}`):
the farthest predicted arrival window is ~2.5 hours, far too long to wait
out live, so this explicitly backdates a station's simulated flag time to
jump straight to the predicted / confirmed / cleared phase for any
downstream target. It sets *when* you're looking, not the underlying
transport math -- the same model and phase boundaries apply at every jump
point (see `src/cdsHooks/server.ts`).

### Try it

```bash
# List the 6 real network stations, upstream to downstream
curl http://127.0.0.1:4300/demo/stations

# Flag the most-upstream station (simulates a breach)
curl -X POST http://127.0.0.1:4300/demo/simulate \
  -H "Content-Type: application/json" \
  -d '{"stationId":"PT-SANTA-CLARA","flagged":true,"severityIndex":0.9}'

# Per-station state + evaluation (own-flag or downstream-forecast phase)
curl http://127.0.0.1:4300/demo/state

# Every currently-active downstream forecast, cascaded through the flow order
curl http://127.0.0.1:4300/demo/forecasts

# Same forecasts as real FHIR RiskAssessment resources
curl http://127.0.0.1:4300/demo/forecast-bundle

# Ask patient-view for a patient at a downstream station
curl -X POST http://127.0.0.1:4300/cds-services/patient-view \
  -H "Content-Type: application/json" -d '{
    "hookInstance": "t1", "hook": "patient-view",
    "context": {"userId": "Practitioner/demo-md", "patientId": "demo-patient"},
    "prefetch": {"patient": {"resourceType": "Patient", "address": [{"extension": [
      {"url": "http://hl7.org/fhir/StructureDefinition/geolocation", "extension": [
        {"url": "latitude", "valueDecimal": 40.2038},
        {"url": "longitude", "valueDecimal": -8.4285}
      ]}
    ]}]}}
  }'
```

## Not implemented / out of scope

- No spatial catchment polygon (unlike the sibling Python service's
  shapely-based `CatchmentIndex`) — `patientView.ts` uses a fixed radius
  around each station's point instead. A real deployment needs a surveyed
  network/catchment geometry.
- No persistent store — in-memory state only, single process (same caveat
  as the sibling Python service's `_CatchmentStateCache`).
- No authentication on any endpoint.
- No live CQL execution engine (see the CQL note above).
- `order-select`'s CDS Hooks context doesn't carry a geocoded patient
  address the way `patient-view`'s prefetch does, so its stewardship
  trigger checks "is anything confirmed anywhere in the network" rather
  than being patient-location-aware like `patient-view` is — a documented
  simplification, see `orderSelect.ts`.
- A single network-wide mean velocity (0.36 m/s) is applied to every
  segment; a real deployment would vary this per reach based on local
  channel geometry (see `channelDispersion.ts` for the estimator that
  would support that).
