# PathoStream-EHR (prototype)

A One Health interoperability demo connecting synthetic upstream river
telemetry to a synthetic emergency-department CDS Hooks flow, built against
the architecture in the original engineering brief.

**Two independent case studies live here**: the original Mithi River
(Mumbai) implementation in `app/` + `web/`, and a second, independently
implemented Mondego River (Coimbra, Portugal) case study in `oah-mondego/`,
proving the same FHIR/CDS-Hooks pattern is a portable standard, not a
property of one codebase. Open `index.html` at the repo root (e.g.
`python -m http.server 8090`, then visit `http://127.0.0.1:8090/`) once
both are running for a single page that links to both dashboards, shows
live up/down status for each backend, and summarizes what each one adds.

## ⚠️ Clinical & regulatory status -- READ THIS FIRST

**This is prototype/demo code. It is not a cleared or certified medical
device, has not been clinically validated, and must not be used to guide
real patient care.** It was built for a hackathon-style engineering
exercise, not as a production CDS system. Specifically:

- The empiric antibiotic logic in `app/core/gemini_synthesizer.py` encodes
  a plausible, publicly-documented Sanford Guide/IDSA-style pattern (the
  same one the original brief named), but it has not been reviewed by
  clinical pharmacy, infectious disease, or an institutional P&T committee,
  and does not do real drug-interaction or dosing checking.
- Real deployment of anything like this needs the regulatory pathway
  appropriate to clinical decision support software (e.g. FDA SaMD in the
  US), a real safety/hazard analysis, and sign-off from the clinical teams
  who would actually use it.
- The FHIR terminology codes were checked against public sources (see
  "Code corrections" below) but two remain unverified placeholders --
  do not go live against a real FHIR server without resolving those first.
- The river catchment boundary is an illustrative approximation, not a
  surveyed hydrological boundary (see "Data provenance" below).

## What's actually implemented

```
pathostream-ehr/
├── app/
│   ├── main.py                 FastAPI gateway (/ingest, /cds-services, /persist, /demo/*)
│   ├── config.py                pydantic-settings configuration
│   ├── models/                  telemetry, IndicatorsOah, FHIR R4, CDS Hooks schemas
│   ├── core/
│   │   ├── anomaly_engine.py    Catchment Contamination Index (CCI) + biohazard flag
│   │   ├── spatial_engine.py    shapely point-in-polygon catchment matching + declared flow order
│   │   ├── propagation_engine.py  downstream contamination-arrival forecasting (resilience/early-warning)
│   │   ├── fhir_compiler.py     IndicatorsOah -> FHIR R4 transaction Bundle (current + predicted risk)
│   │   └── gemini_synthesizer.py Gemini 1.5 Flash + deterministic fallback CDS card
│   ├── services/
│   │   ├── ingest_service.py    ingestion pipeline + per-station/catchment cache
│   │   ├── cds_service.py       CDS Hooks discovery + patient-view handler (incl. predictive pre-alert)
│   │   ├── demo_state.py        bounded CCI history for the web dashboard's trend chart
│   │   └── fhir_client.py       HAPI FHIR REST client
│   └── data/mithi_catchment.geojson
├── tests/                       32 tests, all passing (pytest)
├── simulator/stream_generator.py  synthetic YSI EXO2 + Colilert/Aquagenx stream
├── web/                         React + Vite + Tailwind + MapLibre GL + Recharts dashboard (primary UI)
├── ui/dashboard.py               Streamlit split-screen ("River" / "Hospital") demo (fallback, zero-build)
└── oah-mondego/                 second, independent TS/Express case study -- Mondego River, Portugal
```

### Demo frontend (`web/`)

A React/TypeScript dashboard that talks to the FastAPI backend over plain
HTTP/JSON -- no data is fabricated in the browser; every reading comes from
`simulator/stream_generator.py` run server-side. It adds four endpoints to
`app/main.py` purely for this UI (`/demo/stations`, `/demo/config`,
`/demo/tick`, `/demo/history/{catchment_id}`, `/demo/catchment-boundary`,
`/demo/reset`); the core CDS Hooks / FHIR surface above is unchanged and the
frontend calls `POST /cds-services/patient-view` directly, same as
`ui/dashboard.py` and `tests/test_cds_hooks.py`.

- **MapLibre GL** river map: real OSM basemap, the actual (illustrative)
  catchment polygon from `app/data/mithi_catchment.geojson`, and stations
  that pulse when biohazard-flagged (via `setFeatureState`, not a full
  GeoJSON re-render per frame).
- **Recharts** CCI trend line per station, with the real
  `cci_biohazard_threshold` from `app/config.py` as a reference line --
  fetched from `/demo/config`, not hardcoded, so it can't drift from the
  backend's actual setting.
- Note: because `_CatchmentStateCache.get()` (see `ingest_service.py`)
  intentionally returns the catchment-wide worst reading, selecting a
  *different, currently-healthy* station as the patient's address will
  still show an active card as long as *any* station in the same catchment
  is flagged -- that's existing backend behavior (favors never missing an
  alert), not a frontend bug.

```bash
cd web
npm install
npm run dev        # http://localhost:5173, expects the API on :8000
```

Verified locally in this environment: `pytest` (32/32 passing),
`flake8 --max-line-length=120` (clean), `mypy --strict` on `app/` and
`simulator/` (clean, with `types-shapely` installed), and the Streamlit
dashboard was executed headlessly with `streamlit.testing.v1.AppTest`
(no exceptions; the critical-card and allergy-routing flows were exercised
end to end, not just unit-tested in isolation).

### Downstream propagation forecasting (`app/core/propagation_engine.py`)

Resilience/early-warning capability layered on top of the reactive CDS
Hooks flow above: given a currently-flagged station and the catchment's
declared upstream-to-downstream flow order (`station_flow_order` in
`app/data/mithi_catchment.geojson`), computes when contamination is
predicted to reach each downstream station -- and fires a precautionary
CDS Hooks card for that station's patients *before* their local sensor
confirms anything. Forecasts are also serialized as real FHIR R4
`RiskAssessment.prediction` resources using the (correctly implemented,
rarely-used) `probabilityDecimal` / `whenPeriod` elements -- see
`GET /demo/forecast-bundle/{catchment_id}`. The specific assumed flow
velocity is an illustrative, documented default (`PROPAGATION_FLOW_VELOCITY_M_S`
in `.env.example`), not a calibrated hydrological measurement -- see that
module's docstring.

## OAH-Mondego: a second, independent case study (`oah-mondego/`)

A separate TypeScript/Express implementation of the same
propagation-forecasting + FHIR + CDS Hooks pattern, against a real
6-station monitoring network along a second river (the Mondego, Coimbra,
Portugal), including a real 1D advection-dispersion transport model
independently validated against a direct numerical PDE solution, a
Fischer (1979)/Liu (1977) physically-grounded dispersion-coefficient
estimator, an EU Water Framework Directive EQR classification, and a
`cds-services/order-select` antimicrobial-stewardship trigger. It exists
to demonstrate that the pattern is a portable standard, not a property of
one Python codebase. **Read `oah-mondego/README.md` and `oah-mondego/METHODS.md`
first** -- they document exactly which inputs (a LOINC code, all 6 station
names, 3 of 6 stations' exact coordinates, a leptospirosis/flooding
epidemiology citation) were independently verified and which (2 of 6
stations' precise coordinates, the network-wide flow velocity, the
upstream-to-downstream ordering) are estimated or illustrative, following
the same disclosure policy as this file's own "Code corrections" and "Data
provenance" sections below.

## Code corrections (please read before trusting any medical code herein)

The original brief's own top requirement was "no fake or mock medical
code." Checking its asserted codes against public LOINC/SNOMED sources
turned up several that were incorrect:

| Analyte / concept | Brief asserted | Actually is | Used here instead |
|---|---|---|---|
| Fecal coliforms (water) | LOINC `2160-0` | **Creatinine [Mass/volume] in Serum or Plasma** -- a routine kidney-function blood test, unrelated to water microbiology | LOINC `20769-6`, "Coliform bacteria [#/volume] in Water by Viability count" (verified; LOINC has no dedicated "fecal coliform" component) |
| pH (water) | LOINC `2708-6` | **Oxygen saturation** -- used in HL7's own arterial oxygen-saturation vital-sign profile | LOINC `9481-3`, "pH of Water" (verified) |
| Septic shock | SNOMED CT `240369006` | not verified as a real/active concept in that role | SNOMED CT `76571007`, "Septic shock (disorder)" (verified) |
| Leptospirosis | SNOMED CT `284530008` | not verified as a real/active concept in that role | SNOMED CT `77377001`, "Leptospirosis (disorder)" (verified) |
| Sepsis | SNOMED CT `91302008` | correct as given | unchanged |

Two codes could **not** be verified in the time available and are shipped
as loud placeholders (`LoincCodes.DISSOLVED_OXYGEN_WATER` /
`WATER_TEMPERATURE` in `app/core/fhir_compiler.py`, literally set to
strings like `"UNVERIFIED_DISSOLVED_OXYGEN_WATER"`): a dedicated LOINC
code for "Dissolved Oxygen in Water" and "Temperature of Water". Resolve
these against a live LOINC terminology server (fhir.loinc.org, free
account) before pointing the FHIR compiler at a real server.

### Standards-version notes
- `hl7.eu.fhir.oah` is real -- it's the EU "OneAquaHealth" project's FHIR
  IG (source: https://github.com/hl7-eu/oah, CI build at
  https://build.fhir.org/ig/hl7-eu/oah/). As of writing it's explicitly
  marked "not an authorized publication" / "changes regularly," and we
  could only confirm its `IndicatorsOah` model's `biological` branch
  (with sub-indicators like macroinvertebrates and diatoms) against public
  sources. `app/models/oah_indicators.py`'s `water`/`biological`/`bioRisk`
  grouping is a good-faith structural interpretation of the brief's
  description, not a verified line-for-line match to the live draft --
  diff against the current build before claiming conformance.
- CDS Hooks: HL7's current *officially published* version is **2.0.1
  (STU2)**; **3.0.0 exists only as a normative ballot** at the time of
  writing. The `patient-view` shapes used here (discovery manifest;
  hookInstance/hook/context/prefetch; cards with
  uuid/summary/indicator/detail/source/suggestions) are unchanged between
  2.0.1 and the 3.0 ballot text we reviewed, but re-check before relying
  on this against a final 3.0 release.

## Data provenance

`app/data/mithi_catchment.geojson` is a **simplified, illustrative**
corridor -- a buffered polygon around a manually-digitized line through
published waypoints (Vihar Lake, Powai, Saki Naka, Kurla, Bandra Kurla
Complex, Vakola/Kalina, Dharavi, Mahim Creek), sourced from the Mithi
River's Wikipedia entry and a Maharashtra Pollution Control Board report.
It is **not** a surveyed hydrological catchment boundary. Replace it with
an official BMC/MPCB/CWC shapefile before treating spatial matches against
it as meaningful.

## Design decisions and gaps versus the original brief

- **DiatomStressWeight values**: the brief named the three qualitative
  categories (healthy / moderate_stress / acute_collapse) but never gave
  numeric weights for the CCI formula. `app/core/anomaly_engine.py`
  assigns explicit, documented defaults (0 / 5 / 15) rather than silently
  guessing -- treat these as a tunable prototype default, not a validated
  constant.
- **FHIR resource models** (`app/models/fhir_resources.py`) are
  purpose-built for the ~7 resource shapes this project actually emits,
  not a general FHIR R4 library.
- **google-genai usage**: `app/core/gemini_synthesizer.py` asks Gemini
  only to *phrase* an antibiotic choice that deterministic Python logic
  has already made (see `_empiric_regimen`) -- Gemini is never the thing
  deciding which drug to suggest, and any failure/timeout/missing key
  falls back to the pure-Python `deterministic_fallback_card` with
  identical clinical content, satisfying the brief's "never drop an
  alert" requirement without depending on Gemini's availability.
- **Multi-station catchments**: the ingestion cache tracks state
  per-station within a catchment and, when asked for "the" state of a
  catchment, prefers any currently-flagged station over a healthy one
  (see the docstring on `_CatchmentStateCache` in
  `app/services/ingest_service.py`). An earlier version of this cache
  stored only one reading per catchment and could silently lose an active
  flag when a healthy station's reading was ingested after a flagged
  one's -- exactly the failure mode the brief says must never happen.
- **Not implemented / out of scope for this pass**: `pyproject.toml`
  (a `requirements.txt` is provided instead); a persistent (non-in-memory)
  catchment-state store for multi-worker deployments; retry/backoff on the
  FHIR client; authentication on any endpoint (add before exposing this
  beyond localhost).

## Running it

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # optionally set GEMINI_API_KEY, FHIR_BASE_URL

# API (required by both frontends below)
uvicorn app.main:app --reload

# Primary dashboard: React + Vite + MapLibre + Recharts, calls the API over HTTP
cd web && npm install && npm run dev   # http://localhost:5173

# Fallback dashboard: Streamlit, runs in-process, no API server needed
streamlit run ui/dashboard.py

# Tests / linting
pytest
flake8 --max-line-length=120 app simulator tests ui
mypy --strict app simulator
cd web && npx tsc -b && npm run build

# OAH-Mondego: second, independent case study (see oah-mondego/README.md first)
cd oah-mondego && npm install && npm test && npm run dev   # http://127.0.0.1:4300
```
