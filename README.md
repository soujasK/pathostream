# OAH-Mondego (prototype)

A One Health clinical decision support prototype for the Mondego River
through Coimbra, Portugal: a real 6-station monitoring network feeding a
1D advection-dispersion transport model, serialized as real FHIR R4
`RiskAssessment.prediction` resources, and served over an Express CDS
Hooks service that fires a precautionary card in the EHR before a
clinician would otherwise have any reason to suspect waterborne exposure.
A second, independent layer -- a real EWMA statistical control chart
(Roberts 1959) over live, noisy per-station telemetry -- adds genuine
early-warning detection on top of the transport/forecasting model, rather
than relying on an operator-set flag alone. See "Two independent
signals" below and `METHODS.md` §8.

**See `METHODS.md`** for the governing equations, parameter provenance,
and independent numerical validation behind the transport model -- the
research-methods-register companion to this operational README.

## ⚠️ Status — read this first

**Prototype only. Not validated hydrology, not a certified medical device,
not conformant to any official Portuguese WFD assessment.** See "What's
verified vs illustrative" below before citing any specific number from
this project.

## Why this case study, why now: the real European problem

This isn't a generic "waterborne disease demo" reskinned onto a European
river. Three independently verified facts ground it in a real, current EU
problem:

1. **Flooding is a growing, quantified public-health risk across the EU,
   and it specifically elevates waterborne-pathogen exposure.** Per the
   European Environment Agency (fetched directly, not recalled): *"Between
   1980 and 2022, 5,584 flood-related deaths were recorded in the 32 EEA
   member countries"*; *"around 53 million people (12% of Europe's
   population) live in areas potentially prone to river flooding"*; and,
   most directly relevant to this project's premise, *"heavy rainfall
   events make it twice as likely to have harmful pathogen concentrations
   in water bodies due to contaminated run-off and combined sewage
   overflows."*
2. **The Mondego at Coimbra has real, measured, published contamination**,
   not a hypothetical one. Kötke et al. (2024, *Heliyon* 10(15):e34825)
   measured pharmaceutical concentrations rising ~40-fold immediately
   downstream of Coimbra's wastewater treatment plant, with carbamazepine
   reaching an environmental risk quotient of 53 (>1 = high risk) in that
   stretch. See `METHODS.md` §6a.
3. **Coimbra is the real coordinating site of an active, EUR 4.9M
   Horizon Europe research programme (OneAquaHealth, CORDIS grant
   101086521, 2023-2026)** built around exactly this idea -- that urban
   freshwater ecosystem health and human One Health outcomes are linked,
   and that decision-makers need better environmental-surveillance
   tooling to act on that link. This prototype is **not** a deliverable of
   that grant and claims no affiliation with it, but it targets the same
   city, reuses the HL7 Europe OneAquaHealth FHIR IG that project's own
   standards partner (HL7 Europe) publishes, and is honestly disclosed
   against the real project's own published scope -- including where this
   demo's station choices diverge from OneAquaHealth's actual field sites.
   See `METHODS.md` §6b for that full disclosure.

The engineering problem this solves is standards-plumbing, not hydrology
research: today, a river/catchment sensor network and a hospital EHR are
two systems that don't talk to each other, so a clinician has no
structured, timely signal that a patient's home address sits downstream of
an active contamination event. This prototype demonstrates that closing
that gap is a solvable interoperability problem *today*, using FHIR R4 and
CDS Hooks -- standards that already exist -- rather than a research
problem requiring new infrastructure.

## Two independent signals: detection vs. propagation

It's tempting to treat "a station is contaminated" as a single fact an
operator flips on. This prototype deliberately keeps two **independent**
signals, because a real deployment would have to:

1. **Detection** (`src/analytics/`, new): a real EWMA statistical process
   control chart (Roberts 1959) continuously monitors each station's live,
   noisy telemetry and raises a statistical alarm on a *sustained drift*,
   not a hand-toggled switch or a single-sample threshold. Drive it from
   the dashboard's "Statistical early-warning layer" panel -- watch a
   station move from "in control" to "anomaly detected" a few ticks after
   injecting a synthetic contamination event, live.
2. **Propagation** (`src/hydrology/`, described above): once a station
   *is* contaminated (by either the detector or the manual "Simulate
   breach" control), the transport model predicts when and with what
   probability that signal reaches every downstream station.

These are not fused in this prototype -- the detector's alarm does not
automatically set a station's exposure-engine flag. That fusion is real,
useful future work, named honestly as unfinished rather than either
skipped silently or implemented hastily just to claim it exists. See
`METHODS.md` §8 for the full statistical detail and citations.

## What's verified vs illustrative

| Claim | Status |
|---|---|
| LOINC `82195-9` ("Gastrointestinal pathogens DNA and RNA panel - Stool by NAA with non-probe detection") | **Verified** against loinc.org at build time. |
| SNOMED CT `77377001` ("Leptospirosis (disorder)") | **Verified** against browser.ihtsdotools.org. |
| All 6 network station names (Ponte de Santa Clara, Parque Dr. Manuel Braga, Parque Verde do Mondego, Parque Choupalinho, Açude-Ponte, Mata Nacional do Choupal) | **Verified** — every station is a real, independently confirmed place on the Mondego in Coimbra (Wikipedia, Câmara Municipal de Coimbra, Tripadvisor/Lonely Planet). |
| Coordinates for Ponte de Santa Clara, Açude-Ponte, Mata Nacional do Choupal | **Verified** — sourced directly from a public reference (e.g. Wikipedia's infobox), independently fetched, not recalled. |
| Coordinates for Parque Dr. Manuel Braga, Parque Choupalinho | **Illustrative.** Names and real existence verified; no precise public geocode was found for either, so coordinates are estimated by interpolation from confirmed neighbors' positions — see `src/data/mondegoNetwork.ts`. |
| Upstream-to-downstream station order | **Illustrative.** Derived from sourced textual descriptions (e.g. Câmara Municipal de Coimbra: "Parque Manuel Braga extends... between Largo da Portagem... and Parque Verde do Mondego") plus the Mondego's real flow direction through Coimbra — not a surveyed hydrological flow-direction analysis. |
| This demo's 6 stations are OneAquaHealth's real Coimbra field sites | **No.** The real project monitors small urban tributary streams (Ribeira de Eiras, Ribeira de Coselhas, the Fornos river, Vale das Flores) — see `METHODS.md` §6b. This demo's stations are real, independently geocodable Mondego-riverbank landmarks chosen for a patient-proximity CDS demo, not OneAquaHealth's literal pilot sites. |
| Centro Hospitalar e Universitário de Coimbra (CHUC) is a real hospital serving Coimbra | **Verified** (Wikipedia, EATRIS, hospitaisonline.pt) — the largest hospital complex in Portugal. Used as realistic framing in CDS card copy (`src/data/mondegoNetwork.ts`'s `CHUC_ANCHOR`); this demo does **not** integrate with any real CHUC system, and CHUC is not a confirmed OneAquaHealth partner. |
| A `RiskAssessment`-specific profile in the real HL7 Europe OAH FHIR IG (e.g. a "RiskAssessmentOah" StructureDefinition) | **Not independently verified.** The real IG (github.com/hl7-eu/oah) is confirmed to exist and is a CI-build draft, not published; we independently confirmed it defines an *Observation* profile (`observation-with-component-oah`), but found no evidence of a RiskAssessment-specific profile. `buildForecastRiskAssessment` therefore emits plain base-R4 RiskAssessment resources without an OAH `meta.profile` claim — see that function's docstring in `src/fhir/riskAssessment.ts`. |
| Mean flow velocity (0.36 m/s, applied network-wide) | **Not independently verified.** No public river-gauge reading was available to check this against. Treated here as a documented, tunable, illustrative default. Per-segment distances themselves are computed from each station pair's real (or estimated, per above) coordinates via the haversine formula, not assumed. |
| Longitudinal dispersion coefficient (8 m²/s default) | **Illustrative.** Within the typical literature range for small/medium urban channels (Fischer et al. 1979), not calibrated to the real Mondego. Configurable — see `AdvectionDispersionParams`. |
| The 1D advection-dispersion equation / Taylor-dispersion approximation (peak = x/u, σ_t² = 2Dx/u³) | **Real, standard transport theory** (Fischer, List, Koh, Imberger & Brooks, *Mixing in Inland and Coastal Waters*, 1979). Correctly implemented; see `src/hydrology/advectionDispersion.ts`. |
| The EU WFD 5-class EQR system (High/Good/Moderate/Poor/Bad) | **Real** regulatory structure. The specific numeric class boundaries used here are **illustrative**, not Portugal's official, type-specific, intercalibrated boundaries — see `src/hydrology/wfdClassification.ts`. |
| CDS Hooks 3.0.0 | **Ballot draft, not a published HL7 standard** at the time of writing (2.0.1 is the current official version). Implemented here at the project's explicit request; re-verify `order-select`'s shape against the final 3.0 release before any real deployment. |
| CQL rules in `src/cql/` | **Authored, valid CQL expressing the real exposure/stewardship logic** — not wired to a live CQL execution engine in this demo. The equivalent logic is *also* implemented directly in TypeScript (`exposureEngine.ts`, `orderSelect.ts`) so the running service doesn't depend on an engine that isn't here. See `src/cql/README.md`. |
| "<35ms evaluation latency" | **Measured, not asserted.** `test/cdsHooks.test.ts` times `handlePatientView` directly (excluding HTTP/network overhead, which is a deployment concern, not a property of the logic) across 50 warmed-up calls. Measured: **~0.01ms average, ~0.015ms max** on this machine — see that test's console output. |
| Fischer (1979) / Liu (1977) dispersion-coefficient predictive equation (`D_L = 0.011 U²W²/(HU*)`) | **Real, independently confirmed** against two secondary sources reporting the same coefficient and form. Implemented in `src/hydrology/channelDispersion.ts`, available for real channel-geometry input; not used for the Mondego default because that geometry data doesn't exist for this case study. |
| The closed-form Taylor-dispersion approximation actually solves the governing PDE it approximates | **Independently checked**, not just asserted: `src/hydrology/numericalValidation.ts` solves the real 1D advection-dispersion PDE via finite differences and `test/numericalValidation.test.ts` confirms agreement (peak time within 10%, spread within 15%) at a representative Peclet number, with the residual discrepancy attributed to a specific, understood source (first-order-upwind numerical diffusion). See `METHODS.md` §4. |
| The leptospirosis/flooding clinical rationale | **Real, verified epidemiology** — Naing et al. (2019), *PLoS One* 14(5):e0217643 (PMID 31141558), pooled OR 2.19 for leptospirosis after flood exposure across 14 studies. See `METHODS.md` §6. |
| Flooding doubles the odds of harmful pathogen concentrations in EU water bodies | **Real, verified** — European Environment Agency, fetched directly from eea.europa.eu. See `METHODS.md` §6 and "Why this case study" above. |
| Measured ~40x pharmaceutical contamination spike downstream of Coimbra's WWTP on the Mondego | **Real, verified** — Kötke et al. (2024), *Heliyon* 10(15):e34825, DOI 10.1016/j.heliyon.2024.e34825. See `METHODS.md` §6a. |
| OneAquaHealth is a real, active EUR 4.9M Horizon Europe project coordinated by the University of Coimbra | **Verified** directly against its official CORDIS project page (grant 101086521). See `METHODS.md` §6b. |
| EWMA control chart (Roberts 1959) for statistical early-warning detection | **Real, independently confirmed** citation and formula; correctly implemented with exact (not asymptotic-only) time-varying control limits and independently tested. See `METHODS.md` §8. |
| The early-warning layer's telemetry reflects real Mondego sensor readings | **No.** Synthetic Gaussian noise around a documented illustrative baseline (15±3 NTU) — see `METHODS.md` §8. The *algorithm* is real; the *data it's fed* is not. |
| GDPR Article 9 / EU Health Data Space (Reg. (EU) 2025/327) compliance | **Not implemented.** Both are real, verified, currently-relevant EU instruments, named and discussed honestly as an acknowledged gap, not implemented or claimed. See `METHODS.md` §9. |

## Architecture

```
.
├── src/
│   ├── data/mondegoNetwork.ts       6-station network + flow order (see provenance notes above)
│   ├── analytics/
│   │   ├── ewma.ts                  real EWMA statistical process control chart (Roberts 1959)
│   │   ├── telemetryStream.ts       synthetic noisy per-station turbidity signal
│   │   └── earlyWarningEngine.ts    wires the two into a per-station early-warning state
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
├── test/                            86 tests: hydrology math, PDE validation, FHIR shape, CDS Hooks, exposure phases, EWMA/telemetry
├── web/                             React + Vite + Tailwind + MapLibre dashboard (the primary demo UI)
├── METHODS.md                       governing equations, parameter provenance, citations
└── index.html                       static "about this project" landing page
```

## Running it

```bash
npm install
npm run dev     # API on http://127.0.0.1:4300, auto-reload
npm test        # 86 tests
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

The "Statistical early-warning layer" panel below it is independent (see
"Two independent signals" above): it ticks its own live clock client-side
(~1.2s/sample) against `/demo/telemetry/tick`, and "Inject anomaly" starts
a sustained synthetic contamination drift at that station's synthetic
sensor from the *next* tick onward -- watch the badge flip from
"In control" to "Anomaly detected" a few ticks later, in real time.

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

# Statistical early-warning layer: inject a synthetic anomaly, then advance
# the telemetry clock a few times and watch outOfControl flip to true
curl -X POST http://127.0.0.1:4300/demo/telemetry/inject \
  -H "Content-Type: application/json" -d '{"stationId":"PT-SANTA-CLARA"}'
curl -X POST http://127.0.0.1:4300/demo/telemetry/tick

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

- No spatial catchment polygon — `patientView.ts` uses a fixed radius
  around each station's point instead. A real deployment needs a surveyed
  network/catchment geometry.
- No persistent store — in-memory state only, single process.
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
- The EWMA early-warning layer's alarm does not automatically set a
  station's exposure-engine flag (see "Two independent signals" above).
- No GDPR consent management, Article 30 processing register, or Data
  Protection Impact Assessment; no EHDS conformance (Health Data Access
  Body process, certified EHR system). See `METHODS.md` §9 for what these
  real EU instruments require and why they're out of scope here.

## Clinical & regulatory status

**This is prototype/demo code. It is not a cleared or certified medical
device, has not been clinically validated, and must not be used to guide
real patient care.** It was built for a hackathon-style engineering
exercise. Real deployment of anything like this needs the regulatory
pathway appropriate to clinical decision support software in the relevant
jurisdiction (e.g. EU MDR/IVDR for software as a medical device), a real
safety/hazard analysis, and sign-off from the clinical teams who would
actually use it.
