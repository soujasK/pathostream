# OAH River Watch (prototype)

**Companion documents:** [EVALUATION.md](EVALUATION.md) (is the detector any
good, and how badly does it degrade) · [SAFETY_CASE.md](SAFETY_CASE.md)
(intended use, EU MDR/AI Act self-assessment, hazard log) ·
[MODEL_CARD.md](MODEL_CARD.md) (intended use, data, metrics, limits) ·
[METHODS.md](METHODS.md) (equations, citations) ·
[conformance/README.md](conformance/README.md) (official FHIR validator
results). All four besides METHODS.md are generated from code (`npm run
evaluate`, `npm run safety-case`) and test-checked against what actually
ships.

## What is this? (the plain version)

When heavy rain pushes sewage into a river, people downstream get sick --
and doctors usually only find out after the patients show up. **This
project warns the doctor *before* that happens**, at the moment they open
the chart of someone who lives downstream of a contamination event.

How, in five steps (all of it runs in the demo):

1. Sensors along a river report how cloudy the water is (simulated here).
2. A statistics check notices when a station stays cloudier than normal
   and marks it contaminated -- or you press a test button to say so.
3. A flow model predicts how fast the contamination moves downstream:
   minutes on a city reach, days on the Danube.
4. That prediction is written in a standard medical data format (FHIR), so
   any hospital system can read it.
5. A doctor opens the chart of a patient living near an affected station
   and a warning card appears, suggesting a stool test so antibiotics
   aren't guessed blindly.

There's also a second way a station gets flagged, alongside the sensor
path above: a citizen can submit a structured water/habitat report
(clarity, odor, dead wildlife, discoloration, foam), a small trained
classifier scores it and explains why, and a human reviewer -- never the
model itself -- decides whether to confirm it. See "Citizen reports and
the triage classifier" below.

It covers **9 real rivers, 41 stations and 15 EU member states**. What it
proves is not a new sensor or a new hydrology model -- it's that the pipe
from river data to a doctor's screen can be built *today* from standards
that already exist.

**Real vs. fake.** Real: the algorithms, the data formats, the places and
the citations. Fake: the sensor readings, the river speeds, and any
connection to a real hospital. (One partial exception: 5 German stations
also show a genuinely live water-*level* reading from a real government
API -- see "A real, live data source" below.)

### Rivers covered

| River | Countries (stations) | Real water-side counterpart |
|---|---|---|
| Mondego | Portugal (6) | -- (framed by the real OneAquaHealth project, based in Coimbra) |
| Douro | Spain, Portugal (4) | Albufeira Convention, 1998 |
| Tagus | Spain, Portugal (4) | Albufeira Convention, 1998 |
| Danube | Germany, Austria, Slovakia, Hungary, Croatia, Bulgaria, Romania (7) | ICPDR Accident Emergency Warning System |
| Rhine | France, Germany, Netherlands (4) | ICPR International Warning and Alarm Plan Rhine |
| Elbe | Czechia, Germany (4) | ICPER warning and alarm plan; ALAMO spread model |
| Oder | Poland, Germany border (4) | The real 2022 fish die-off -- a cross-border warning failure |
| Meuse | France, Belgium, Netherlands (4) | International Commission on the Meuse, 2002 Ghent Agreement |
| Sava | Slovenia, Croatia (4) | International Sava River Basin Commission, 2005 |

Meuse and Sava were added specifically to bring Belgium and Slovenia into
the EU coverage (still 15 of 27 member states, not all of them -- several,
especially the Nordic/Baltic states and the small states with no
comparable cross-border river, remain uncovered by design of the
"river crosses a border" pattern this project uses).

Every station is a real place whose coordinates were fetched from its own
public infobox; every river's sourcing and caveats are listed in "What's
verified vs illustrative" below and shown in the dashboard.

### A real, live data source (water level, not turbidity)

Checked directly, not assumed: **no public real-time turbidity API exists
anywhere in Europe.** Real-time river *level* data does, though --
Germany's PEGELONLINE (Wasserstraßen- und Schifffahrtsverwaltung des
Bundes), a real government REST API, no authentication required, licensed
DL-DE->Zero-2.0. Five of this project's German stations (Rhine's Mainz;
Elbe's Dresden, Magdeburg, Hamburg; Oder's Frankfurt (Oder)) are matched
to a real federal gauge within ~2 km, and the dashboard shows that live
reading in a small, deliberately distinct "LIVE" badge next to those
stations. **It is water level, not turbidity, and does not feed the
detector** -- it exists purely as honest, live, real-world context. See
`src/data/realGauges.ts` and `IOT_ARCHITECTURE.md` (which documents the
real path -- a published open-source turbidity sensor, LoRaWAN/NB-IoT,
this project's own tested ingestion endpoint -- that would be needed to
get a real *contamination* signal, since none exists as public data today).

### How it works, technically

Every river feeds the same 1D advection-dispersion transport model,
serialized as real FHIR R4 `RiskAssessment.prediction` resources, over the
same Express CDS Hooks service. A real EWMA statistical control chart
(Roberts 1959) over live, noisy per-station telemetry detects a developing
anomaly and -- after a sustained run -- auto-escalates it into the same
confirmed-exposure state that drives the downstream forecast and the
clinical alert, rather than relying on an operator-set flag alone. See
"One causal chain" and "One consequence path for every river" below, and
`METHODS.md` §8.

The dashboard is organized as three views: **Water Authority Operations**
(a Europe-wide coverage map, then one river at a time: map, forecasts, demo
controls), **Emergency Department** (pick any station on any river as a
patient's home and see the clinician's card), and **Incident Timeline**
(one plain-language narrative of every real state change across all rivers
-- a client-side diff of the same polled state, not a separate data source).
Rivers come from a registry (`src/data/catchments.ts`): adding one is a data
file, and the routes, engines, map, picker and disclosure panel follow.

**See `METHODS.md`** for the governing equations, parameter provenance,
and independent numerical validation behind the transport model -- the
research-methods-register companion to this operational README.

## ⚠️ Status — read this first

**Prototype only. Not validated hydrology, not a certified medical device,
not conformant to any member state's official WFD assessment.** See "What's
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
4. **Cross-border river management is a real, EU-recognized regulatory
   problem, not a hypothetical one.** Spain and Portugal jointly manage
   the Douro/Duero (897 km, the largest Iberian river basin) and four
   other shared basins under the Albufeira Convention (1998, in force
   since 2000) -- an independently confirmed bilateral treaty establishing
   real-time hydrometeorological data-sharing between the two countries.
   The Douro network in this prototype is a small, illustrative
   demonstration of what a FHIR-based version of that real data-sharing
   obligation could look like. See `METHODS.md` §6b/§8.

The engineering problem this solves is standards-plumbing, not hydrology
research: today, a river/catchment sensor network and a hospital EHR are
two systems that don't talk to each other, so a clinician has no
structured, timely signal that a patient's home address sits downstream of
an active contamination event. This prototype demonstrates that closing
that gap is a solvable interoperability problem *today*, using FHIR R4 and
CDS Hooks -- standards that already exist -- rather than a research
problem requiring new infrastructure.

## One causal chain: detection -> escalation -> propagation -> alert

"A station is contaminated" is not a fact an operator should have to flip
on. The prototype models the whole chain:

1. **Detection** (`src/analytics/`): a real EWMA statistical process
   control chart (Roberts 1959) continuously monitors each station's live,
   noisy telemetry and flags a *sustained drift* -- not a hand-toggled
   switch or a single-sample threshold.
2. **Escalation**: a station that stays out of control for **6 consecutive
   ticks** (`ESCALATION_THRESHOLD_TICKS`) is auto-escalated to a confirmed
   exposure in its own network's exposure engine. A single noisy blip is
   deliberately *not* escalated -- the Incident Timeline shows those as
   "returned to normal before the escalation threshold -- correctly not
   escalated," which is the rule working, not a bug.
3. **Propagation** (`src/hydrology/`): once a station is confirmed (by
   escalation *or* by the manual "report confirmed contamination" testing
   control), the transport model predicts when and with what probability
   that signal reaches every downstream station.
4. **Alert**: for Mondego stations, that state drives the CDS Hooks
   `patient-view` card at CHUC. Try it end to end with **no manual
   report**: on the Operations tab press "Test: simulate rising
   turbidity" on any station, then watch the Incident Timeline narrate
   detection -> auto-escalation -> downstream predictions on its own.

Every confirmation records **how** it was confirmed (`confirmedVia:
'operator' | 'statistical-detection'`), and that provenance is carried all
the way to the clinician: a card for an auto-escalated station says it was
"auto-escalated from a sustained statistical turbidity anomaly (an
inferred early-warning signal, not a direct pathogen or biohazard
measurement)" rather than claiming a direct biohazard signature. An
operator's report is the only thing described as an observed signature.

**What this rule is and isn't.** 6 ticks is not a guess: it's the smallest
persistence value whose simulated false-escalation rate meets an explicit,
stated design target (derived by a seeded Monte Carlo / Markov-chain
evaluation, cross-checked two independent ways) -- see **`EVALUATION.md`**
for the full average-run-length characterization, including how far that
guarantee collapses if the real data's noise or autocorrelation doesn't
match the assumption (up to three orders of magnitude). Letting a
statistical signal reach a clinician with no human in the loop is still a
real deployment *policy* decision (alert fatigue, regulatory
classification), not merely a code rule; here it exists to demonstrate the
interoperability chain end to end, and an inferred signal is downgraded
and labelled unconfirmed before it ever reaches a card (see
`SAFETY_CASE.md` hazard H2). See `METHODS.md` §8.

## One consequence path for every river

Every river shares the same machinery (transport model, FHIR serialization,
EWMA layer) **and the same consequence**: a confirmed or predicted exposure
at a station fires a CDS Hooks `patient-view` card for patients living near
it -- see the "Emergency Department" tab, where any station on any river
can be picked as the patient's home.

What differs is only whether a hospital is named, and that follows what was
independently verified:

- **Coimbra (Mondego):** the card names CHUC, a real hospital serving
  Coimbra (used as framing; no real CHUC integration).
- **Every other river:** no hospital is named -- the card says "your
  institution's protocol". Inventing a hospital per city would be exactly
  the fabricated connection this project's disclosure policy exists to
  avoid (`test/catchments.test.ts` asserts CHUC is the *only* hospital
  anywhere in the registry).

Each river's forecast also serializes as a real FHIR `RiskAssessment`
(`/demo/<river>/forecast-bundle`) -- the standards-based building block a
cross-border early-warning exchange would need, independent of any one
consumer.

The `order-select` (antimicrobial stewardship) hook stays Mondego-only: its
CDS Hooks context carries no patient location to choose a river from.

**Why this matters on big rivers.** Plume travel time scales with distance:
minutes across a Coimbra park, but about two and a half days from Passau to
Vienna and about 17 days from Passau to Galați (1,495 km summed straight-line
segments) at the placeholder 1 m/s. That
lead time is the whole argument for warning downstream *clinicians*, not
only downstream water utilities.

Every river, and the statistical early-warning layer, feed the dashboard's
**Incident Timeline** tab -- a single, plain-language, chronological
narrative derived by diffing the same real polled state (see
`web/src/hooks/useIncidentLog.ts`). One noisy out-of-control tick is
deliberately *not* narrated (with 41 stations they occur every few
seconds); an anomaly appears once it lasts 2 ticks, and escalates at 6.

## Citizen reports and the triage classifier

A third confirmation path, alongside an operator's report and the EWMA
auto-escalation above: anyone can submit a structured observation for any
station (water clarity 1-5, unusual odor, dead wildlife, discoloration,
foam -- modelled on the real OneAquaHealth Citizen Science App's own
observation categories, `POST /citizen/observations`, no login). A small
**logistic regression classifier, trained from scratch in this repo**
(`src/citizen/logisticRegression.ts` -- sigmoid, gradient descent, L2
regularization, no ML library dependency) scores it and returns a full,
literal, per-feature explanation (`explainLogit`: the contributions sum
exactly to the model's output -- not a post-hoc approximation of a black
box, because there is no black box here). See the "Citizen observations"
panel on the Water Authority tab.

**The classifier never confirms anything by itself.** Its only possible
output is "recommend human review" or not; only a water-authority operator
explicitly promoting a pending report creates a real, clinically-visible
confirmed exposure (`src/citizen/observations.ts`'s `promoteObservation`
is the *only* path from a citizen report into the same exposure engine
that drives the clinical alert). A promoted report's card discloses its
real origin: *"was reported by a citizen observer (structured
water/habitat checklist, AI-triaged) and reviewed and confirmed by the
water authority"* -- never described as a direct sensor or lab signature.

**Real vs. fake, same discipline as the rest of this project.** Real: the
trained weights (`src/citizen/model.json`, reproducibly trained by `npm
run train-citizen-classifier`, seed 20260922), the held-out accuracy
(90.1% vs. a 76.7% majority-class baseline -- see `MODEL_CARD.md`'s
second model card), and the human-in-the-loop gate. Fake, and disclosed
as such: the training data is entirely synthetic, labelled by this
project's own documented rule (`src/citizen/trainingData.ts`), not by any
real citizen submissions, of which this project has none.

This is also, on our own reading, the one part of this project that
likely **does** qualify as an "AI system" under the EU AI Act -- unlike
the EWMA/transport/rules components elsewhere, which are fixed-form and
human-parameterised. See `SAFETY_CASE.md` section 2.2 (updated) and
hazard **H13**, and `MODEL_CARD.md`'s citizen-classifier section for the
full model card, caveats and recommendations.

## Multi-agent decision support (Google Gemini)

The **Agents** tab (`src/agents/`, `/api/agents/*`) runs four agents over
the same data: a **Sentinel** (telemetry, flags, downstream forecast),
**Citizen Intel** (reports by review status), **Clinical Triage** (a
patient's proximity to monitored stations and a heuristic pathogen
differential) and a **Commander** that combines them into a proposed
action.

**What Gemini does, and what it cannot do.** With `GEMINI_API_KEY` set,
Gemini investigates: it chooses which of its agent's tools to call and
writes a short summary. Every call passes a guard (`src/agents/toolGuard.ts`):
a per-agent tool allowlist (drafting an advisory is never offered to a
model), scope pinned to the request, patient values bound server-side and
never shown to the model, argument type checks, a 6-call / 4-turn budget
and a per-request timeout. Every number, severity and proposal is computed
by the agents from tool results whose arguments they fix themselves -- the
assessment is identical whatever the model does, and a test pins that.
Without a key, or on any model error, the agents run rule-based and the UI
says so ("rule-based (no language model)").

**Humans stay in charge.** Every output is a draft for review: notices are
FHIR `Communication` resources with status `preparation`, marked NOT
ISSUED; an unconfirmed statistical signal can only propose confirmatory
sampling; only reviewed citizen reports count as corroboration; one
patient never changes a population-level proposal. Patient symptoms are
not sent to the model unless `OAH_AGENTS_PATIENT_DATA_TO_LLM=on`, and the
patient identifier and location never are. See hazard **H14** in
`SAFETY_CASE.md` and `test/agentSystem.test.ts`.

Configuration is in `.env` (copy `.env.example`; `.env` is git-ignored):
`GEMINI_API_KEY`, and optionally `OAH_GEMINI_MODEL` (default
`gemini-2.5-flash`; the free tier's per-model daily quota is small),
`OAH_GEMINI_TIMEOUT_MS` and `OAH_AGENTS_PATIENT_DATA_TO_LLM`.

## IoT architecture: from a real sensor to this detector

No public real-time turbidity feed exists in Europe (checked), so the demo's
turbidity is synthetic. `IOT_ARCHITECTURE.md` documents the real path a
physical sensor would take, and **the endpoint it ends at is already
implemented and tested**:

```
[1] Sensor node          [2] Gateway        [3] Network server       [4] This backend
open-source turbidity -> LoRaWAN or      -> decodes payload,     -> POST /iot/devices/:deviceId/telemetry
sensor (Droujko &        NB-IoT             forwards via MQTT        (per-device bearer key)
Molnar 2022, ETH)        (radio)            bridge or HTTP webhook    -> Phase-I baseline gate
+ microcontroller,                          (e.g. The Things          -> EWMA detector (device's own baseline)
battery + solar                             Network)                  -> k-consecutive escalation
```

- **Real and tested (22 tests, `test/iotIngest.test.ts`):** the ingestion
  endpoint, per-device authentication (constant-time key check, and every
  write refused with 503 until `OAH_IOT_DEVICE_KEYS="deviceId:key,..."` is
  configured), the Phase-I baseline-adequacy gate (a device is never
  monitored on an unverified baseline), and the same EWMA detector and
  escalation rule characterized in `EVALUATION.md`.
- **Real, cited standards and hardware, but not deployed here:** the
  sensor (Droujko & Molnar, *Scientific Reports* 2022), LoRaWAN / NB-IoT
  radio, and an off-the-shelf network server. No hardware exists for this
  project, and nothing claims otherwise.
- **Isolated on purpose:** an ingested device never reaches a river's
  exposure engine or a clinician card. Wiring a real sensor into a clinical
  alert is a deliberate safety decision (hazards H2, H12), not a default.
- **Precedent:** the live PEGELONLINE gauge integration already follows the
  same external-feed pattern for a source that exists today.

Example reading from a device:

```bash
curl -X POST http://127.0.0.1:4300/iot/devices/sensor-01/telemetry \
  -H "Authorization: Bearer <device key>" -H "Content-Type: application/json" \
  -d '{"measuredAt":"2026-09-22T10:15:00Z","ntu":14.8}'
```

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
| The EU WFD 5-class EQR system (High/Good/Moderate/Poor/Bad) | **Real** regulatory structure. The specific numeric class boundaries used here are **illustrative**, not any member state's official, type-specific, intercalibrated boundaries — see `src/hydrology/wfdClassification.ts`. |
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
| The auto-escalation rule (6 consecutive out-of-control ticks -> confirmed at fixed severity 0.7) | **Characterized, not calibrated to real data.** 6 is the smallest persistence value meeting an explicit, stated network-wide false-escalation design target for the current 41-station network (raised from 5 when Meuse and Sava were added, since the target scales with station count), derived by simulation and checked two independent ways (Monte Carlo + Markov chain) — see `EVALUATION.md`. That guarantee assumes independent, correctly-scaled Gaussian noise; `EVALUATION.md` §4 shows it collapsing by up to three orders of magnitude when that assumption fails, which is why the alert it produces is shown to a clinician as unconfirmed, never as a confirmed exposure (`SAFETY_CASE.md` H2). It is not calibrated against any real river's telemetry — none exists here. |
| The peak-ETA sensitivity band shown on every forecast (API, card text, FHIR rationale, dashboard) | **An assumption, not a calibrated prediction interval.** Assumes the placeholder mean velocity is log-normal with log-sd 0.5 (about a factor of two either way); the closed-form band is checked against an independent Monte Carlo simulation of the same assumption in `test/uncertainty.test.ts`. It quantifies sensitivity to the placeholder, not real-world accuracy. See `src/hydrology/uncertainty.ts`. |
| GDPR Article 9 / EU Health Data Space (Reg. (EU) 2025/327) compliance | **Not implemented.** Both are real, verified, currently-relevant EU instruments, named and discussed honestly as an acknowledged gap, not implemented or claimed. See `METHODS.md` §9. |
| Douro (897 km) / Duero is the largest Iberian river basin, Spain to the Atlantic at Porto | **Verified** against the river's own Wikipedia infobox, fetched directly. |
| All 4 Douro station names (Zamora, Barca d'Alva, Peso da Régua, Porto) and coordinates | **Verified** — each independently fetched from that place's own Wikipedia infobox, not estimated. |
| Albufeira Convention (1998, Spain-Portugal shared-basin treaty covering the Douro **and the Tagus**) | **Verified** real bilateral treaty, in force since 2000, with confirmed real-time hydrometeorological data-sharing and monthly-monitoring provisions. A specific pollution-incident notification clause could **not** be independently confirmed and is not claimed. See `METHODS.md` §6b. |
| Tagus: 1,007 km, 80,100 km² basin, 47 km of the Spain-Portugal border; stations Toledo, Abrantes, Santarém, Lisbon | **Verified** — river facts from its Wikipedia infobox, each station's coordinates from its own infobox with the river relationship confirmed in the article; order is the infobox's downstream city list. |
| Danube: 2,850 km, 801,463 km² basin; 7 stations (Passau, Vienna, Bratislava, Budapest, Vukovar, Ruse, Galați) across 7 EU states | **Verified** — river facts and every station's coordinates fetched directly, each article confirming the city lies on the Danube. The **order** is *illustrative*: it follows the river's course, not a river-kilometre survey, and the reach between Vukovar and Ruse runs through/along non-EU Serbia, where no station is modeled. |
| Rhine: 1,230 km, 185,000 km² basin; stations Strasbourg, Mainz, Cologne, Lobith | **Verified** — with two disclosed caveats from the articles themselves: Strasbourg's coordinates are its city centre on the Ill, ~4 km from the Rhine; Lobith is only "traditionally" where the Rhine enters the Netherlands (really ~4 km upstream, near Spijk). |
| Elbe: 1,112 km, 148,268 km² basin; stations Ústí nad Labem, Dresden, Magdeburg, Hamburg | **Verified.** Prague is deliberately not a station (it is on the Vltava). |
| Oder: 840 km, 119,074 km² basin; stations Opole, Wrocław, Frankfurt (Oder), Szczecin | **Verified** — the infobox lists these cities in downstream order. |
| The 2022 Oder die-off: >100 tonnes of fish removed on the Polish side and 35 on the German side; cause prymnesin toxins from *Prymnesium parvum*; German officials complained of poor communication from Polish officials | **Verified** from Wikipedia's article on the disaster, fetched directly (its cause statement cites a February 2023 European Commission report). This prototype makes no claim it would have prevented it. |
| This prototype's turbidity signal would have detected the 2022 Oder event | **No.** That was a toxic algal bloom; a turbidity control chart is not claimed to catch it. The point of including the Oder is the missing cross-border hand-off, not the sensor. |
| The ICPDR Accident Emergency Warning System (Danube) exists and warns downstream countries of accidental pollution | **Verified**, but modestly: confirmed via several ICPDR pages surfaced in search; the ICPDR site blocked a direct fetch (HTTP 403), so no operating history or incident counts are claimed. |
| The Rhine's International Warning and Alarm Plan | **Verified directly** on iksr.org: since 1985 seven international main warning centres cooperate within it; it warns "the authorities and drinking water works in the Rhine bordering countries". The recipients named are authorities and water works; this prototype explores adding the clinical side and does not claim none exists. |
| The Elbe commission's warning and alarm plan and its ALAMO spread-forecast model | **Verified** via search results quoting ikse-mkol.org and vtei.cz (not fetched directly). The water side already forecasts spread; this prototype does not claim to replace that. |
| Predicted arrival times on the added rivers | **Optimistic by construction.** Distances are straight-line between consecutive stations (always shorter than the river path), the 1.0 m/s velocity is a single unverified placeholder for all four large rivers, and the default dispersion coefficient is a small-channel value that understates plume spread on a river this size. |
| A named hospital anywhere but Coimbra | **No.** Intentionally not modeled — see "One consequence path for every river" above. |
| The emitted FHIR resources (RiskAssessment Bundle, the proposed ServiceRequest) are R4-structurally valid | **Checked with the official HL7 FHIR Validator**, not just asserted — see `conformance/README.md` for the exact findings (20 errors on the first attempt, fixed; 0 errors, 0 warnings now) and how to reproduce it. |
| The CDS Hooks card, feedback and security implementation matches the 2.0 specification (card fields, `overrideReasons`, the `/feedback` endpoint shape, JWT authentication) | **Verified against the published spec text** (cds-hooks.hl7.org/2.0), each requirement pinned by a test — see `test/cdsConformance.test.ts` and `test/cdsAuth.test.ts`. Authentication is implemented but **off by default** (the demo needs no setup); see "Running it" below to enable it. |

## Architecture

```
.
├── src/
│   ├── data/
│   │   ├── networkTypes.ts          shared shapes: station, river definition, provenance row
│   │   ├── catchments.ts            THE REGISTRY of every river; routes, engines, map and UI derive from it
│   │   ├── mondegoNetwork.ts        6-station Mondego (Coimbra)
│   │   ├── douroNetwork.ts          4-station cross-border Douro/Duero (Spain -> Portugal)
│   │   ├── tagusNetwork.ts          4-station Tagus (Toledo -> Lisbon)
│   │   ├── danubeNetwork.ts         7-station Danube (Passau -> Galati, 7 EU states)
│   │   ├── rhineNetwork.ts          4-station Rhine (Strasbourg -> Lobith)
│   │   ├── elbeNetwork.ts           4-station Elbe (Usti nad Labem -> Hamburg)
│   │   ├── oderNetwork.ts           4-station Oder (Opole -> Szczecin)
│   │   ├── meuseNetwork.ts          4-station Meuse (Charleville-Mezieres -> Maastricht; adds Belgium)
│   │   ├── savaNetwork.ts           4-station Sava (Kranj -> Sisak; adds Slovenia)
│   │   └── realGauges.ts            5 German stations matched to a REAL live gauge (PEGELONLINE) -- water level only, does not feed the detector
│   ├── analytics/
│   │   ├── ewma.ts                  real EWMA statistical process control chart (Roberts 1959)
│   │   ├── telemetryStream.ts       synthetic noisy per-station turbidity signal
│   │   ├── detectorConfig.ts        the detector's design constants -- the ONE place the production engine and the offline evaluation both read, so EVALUATION.md can't describe a different detector than the one that ships
│   │   ├── baseline.ts              Phase-I baseline-adequacy gate (n >= 200, bounded autocorrelation) for a real sensor feed -- wired into the real IoT ingestion path (iot/ingest.ts), not into the synthetic demo telemetry
│   │   └── earlyWarningEngine.ts    wires the above into per-station early-warning state (every river) and auto-escalates sustained anomalies into that river's exposure engine
│   ├── iot/                         real, tested telemetry-ingestion endpoint a physical sensor could call -- isolated from the demo; see IOT_ARCHITECTURE.md
│   ├── citizen/                     logistic-regression triage classifier (trained from scratch), features, synthetic training data, observations store -- human-in-the-loop only; see "Citizen reports" above
│   ├── evaluation/                  offline detector characterization (Monte Carlo + Markov chain), seeded and reproducible -- renders EVALUATION.md and MODEL_CARD.md (both model cards); see `npm run evaluate`
│   ├── safety/                      hazardLog.ts (data) + render.ts -- renders SAFETY_CASE.md; see `npm run safety-case`
│   ├── hydrology/
│   │   ├── advectionDispersion.ts   1D transport model (arrival/peak/clearance/probability)
│   │   ├── channelDispersion.ts     Fischer (1979)/Liu (1977) dispersion-coefficient estimator
│   │   ├── propagation.ts           multi-station cascading forecast (flow-order walk)
│   │   ├── numericalValidation.ts   independent finite-difference PDE solver (validation only)
│   │   ├── uncertainty.ts           sensitivity band on a forecast's ETA (assumed velocity uncertainty, not a calibrated interval)
│   │   └── wfdClassification.ts     EU WFD EQR class mapping
│   ├── fhir/
│   │   ├── types.ts                 FHIR R4 types actually used here
│   │   ├── bundle.ts                FHIR R4 `collection` Bundle assembly (deterministic per-entry `fullUrl`)
│   │   └── riskAssessment.ts        Forecast -> RiskAssessment.prediction serializer (+ generated narrative)
│   ├── cql/
│   │   └── exposureRules.cql        Authored computable exposure/stewardship rules
│   └── cdsHooks/
│       ├── types.ts                 CDS Hooks request/response shapes
│       ├── exposureEngine.ts        Exposure-engine FACTORY + the Mondego instance (own-flag/downstream-forecast evaluation)
│       ├── catchmentEngines.ts      one independent engine per registered river (same factory)
│       ├── douroExposureEngine.ts   thin named export of the Douro engine, kept for direct importers
│       ├── geolocation.ts           FHIR Patient geolocation extraction (shared)
│       ├── patientView.ts           patient-view hook handler (nearest station across ALL rivers)
│       ├── orderSelect.ts           order-select stewardship-trigger handler (Mondego-only)
│       ├── discovery.ts             /cds-services manifest (real, dereferenceable service ids)
│       ├── feedback.ts              CDS Hooks `/feedback` endpoint (accepted/overridden outcomes, override reasons; free text never stored)
│       ├── auth.ts                  CDS Hooks JWT authentication (spec 2.0 "Security and Safety"); off by default
│       ├── realGauge.ts             fetches the live PEGELONLINE reading (timeout, cache, graceful degradation)
│       └── server.ts                Express app; registers one route family per registry entry (+ /demo/catchments, /monitoring/feedback, /real-gauge, /iot)
├── test/                            multiple hundred tests: hydrology math, PDE validation, FHIR shape + official-validator-matched conformance, CDS Hooks (card provenance, feedback, auth), exposure phases, EWMA/telemetry/auto-escalation, the detector evaluation and safety-case traceability, the real-gauge and IoT-ingestion pipelines, and the river registry -- see `npm test` for the current count
├── scripts/                         evaluate.ts / renderEvaluation.ts / renderSafetyCase.ts / exportFhirSamples.ts / trainCitizenClassifier.ts -- regenerate the four generated documents below (+ the citizen classifier's committed weights)
├── web/                             React + Vite + Tailwind + MapLibre dashboard (3 views; a Europe coverage map; everything river-specific comes from /demo/catchments)
├── conformance/                     FHIR samples + the official-validator findings (README.md)
├── evaluation/                      results.json backing EVALUATION.md and MODEL_CARD.md (seeded, reproducible)
├── IOT_ARCHITECTURE.md              the real path from a physical sensor to this detector -- what's real (a published sensor, standard protocols, the tested ingestion endpoint) and what's a design, not a deployment
├── CLINICAL_REVIEW.md               a self-critique of the CDS cards against the published "Five Rights of CDS" framework -- not a substitute for a real clinician review
├── EVALUATION.md                    detector evidence: ARL0/ARL1, comparison with CUSUM/Shewhart, the escalation rule's false-alarm rate and how it degrades, baseline-estimation behaviour
├── SAFETY_CASE.md                   intended use, EU MDR/AI Act self-assessment, a 13-hazard ISO-14971-style log with test-backed traceability
├── MODEL_CARD.md                    Mitchell et al.-format model card for the detector + a datasheet for the synthetic telemetry, plus a second, separate model card for the citizen-report triage classifier
├── METHODS.md                       governing equations, parameter provenance, citations
└── index.html                       static "about this project" landing page
```

## Running it

```bash
npm install
npm run dev     # API on http://127.0.0.1:4300, auto-reload
npm test        # see the printed summary for the current count
npm run build   # tsc -> dist/

# Dashboard (separate terminal, needs the API running above)
cd web && npm install && npm run dev   # http://localhost:5174

# Regenerate the generated documents (all reproducible from a fixed seed)
npm run evaluate             # -> EVALUATION.md, MODEL_CARD.md (~1 minute)
npm run safety-case          # -> SAFETY_CASE.md (instant)
npm run conformance:samples  # -> conformance/samples/*.json, for the official HL7 validator (see conformance/README.md)
```

By default the demo runs **open**: no CDS Hooks authentication, and the
`/demo/*` control routes (report a station contaminated, fast-forward,
inject a synthetic anomaly) are unauthenticated by design, since that is
what lets the dashboard drive the demo with no setup. To run it the way
`SAFETY_CASE.md` hazard H3 assumes for anything beyond a demo:

```bash
OAH_DEMO_ROUTES=off npm run dev   # 404s every /demo/* route; the clinical surface (CDS Hooks, feedback) is untouched
OAH_SEED=12345 npm run dev        # reproducible synthetic telemetry instead of Math.random
# CDS Hooks JWT auth: set OAH_CDS_TRUSTED_JWKS to a JWKS file ({"keys":[...]}) -- see src/cdsHooks/auth.ts
```

The dashboard opens on **Water Authority Operations**: a Europe-wide
coverage map (click a river, or use the river pills), then that river's map,
forecast, demo controls and early-warning panel. The "Demo & testing tools"
panel can report any station as confirmed-contaminated and has a
fast-forward, `elapsedMinutes` demo-speed control (`POST /demo/simulate` for
Mondego, `POST /demo/<river>/simulate` for the others, same shape). Plume
travel time runs from minutes (a Coimbra park) to weeks (the Danube), so the
steps go from +5 min to +7 days; fast-forward explicitly backdates a
station's simulated flag time to jump straight to the predicted / confirmed
/ cleared phase for any downstream target. It sets *when* you're looking,
not the underlying transport math -- the same model and phase boundaries
apply at every jump point (see `src/cdsHooks/server.ts`).

The "Statistical early-warning layer" panel covers every river's stations:
it ticks its own live clock client-side (~1.2s/sample) against
`/demo/telemetry/tick`, and "Test: simulate rising turbidity" starts a
sustained synthetic contamination drift at that station's synthetic sensor
from the *next* tick onward -- watch the badge go "In control" -> "Anomaly
detected" -> (after 6 consecutive ticks) "Escalated -> confirmed", in real
time, with no manual report. Switch to the **Incident Timeline** tab to see
every one of these real state changes, from any river, narrated in plain
language as they happen (see "One causal chain" above). Each river's Reset
also clears that river's telemetry.

### Try it

```bash
# Every river in the registry: stations, countries, sourcing, governance
curl http://127.0.0.1:4300/demo/catchments

# List the 6 real Mondego stations, upstream to downstream
curl http://127.0.0.1:4300/demo/stations
# ...or any other river under /demo/<id>/ (douro, tagus, danube, rhine, elbe, oder)
curl http://127.0.0.1:4300/demo/danube/stations

# Report the most-upstream Mondego station as confirmed-contaminated
curl -X POST http://127.0.0.1:4300/demo/simulate \
  -H "Content-Type: application/json" \
  -d '{"stationId":"PT-SANTA-CLARA","flagged":true,"severityIndex":0.9}'

# Same, for the upstream end of the Danube (Passau, Germany)
curl -X POST http://127.0.0.1:4300/demo/danube/simulate \
  -H "Content-Type: application/json" \
  -d '{"stationId":"DE-PASSAU","flagged":true,"severityIndex":0.9}'

# Per-station state + evaluation (own-flag or downstream-forecast phase) -- each river has its own independent engine
curl http://127.0.0.1:4300/demo/state
curl http://127.0.0.1:4300/demo/danube/state

# Statistical early-warning layer: inject a synthetic anomaly at a station
# on ANY river, then advance the shared telemetry clock a few times and
# watch outOfControl flip to true (and, after 6 ticks, auto-escalate)
curl -X POST http://127.0.0.1:4300/demo/telemetry/inject \
  -H "Content-Type: application/json" -d '{"stationId":"NL-LOBITH"}'
curl -X POST http://127.0.0.1:4300/demo/telemetry/tick

# Citizen report -> AI triage -> human review queue (any station, no login)
curl -X POST http://127.0.0.1:4300/citizen/observations \
  -H "Content-Type: application/json" -d '{
    "catchmentId": "mondego", "stationId": "PT-SANTA-CLARA",
    "observation": {"clarityScore": 1, "unusualOdor": true, "deadWildlife": true,
      "discoloration": true, "foam": false}
  }'
curl http://127.0.0.1:4300/citizen/observations
# ...then a human reviewer confirms it (the ONLY path to a real exposure):
curl -X POST http://127.0.0.1:4300/citizen/observations/<id>/promote

# Every currently-active downstream forecast, cascaded through each river's flow order
curl http://127.0.0.1:4300/demo/forecasts
curl http://127.0.0.1:4300/demo/danube/forecasts

# Same forecasts as real FHIR RiskAssessment resources
curl http://127.0.0.1:4300/demo/forecast-bundle
curl http://127.0.0.1:4300/demo/danube/forecast-bundle

# Ask patient-view for a patient at a downstream station (Coimbra here; use
# any station's coordinates -- e.g. Vienna 48.2083, 16.3725 -- for another river)
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

The full, evidence-linked version of this list -- with which test proves
each *is* handled and exactly what is missing for each that isn't -- is
**`SAFETY_CASE.md`**'s hazard log (H1-H13). Summary:

- No spatial catchment polygon — `patientView.ts` uses a fixed radius
  around each station's point instead. A real deployment needs a surveyed
  network/catchment geometry (`SAFETY_CASE.md` H6).
- No persistent store — in-memory state only, single process; a restart
  silently drops every flag, and a station's own flag never expires on its
  own (`SAFETY_CASE.md` H7).
- CDS Hooks JWT authentication and a `/demo`-route kill switch are
  **implemented** (spec 2.0 "Security and Safety": asymmetric algorithms
  only, replay-checked, audience-checked -- see `test/cdsAuth.test.ts`) but
  **off by default**, so the demo needs no setup. There is still no real
  operator-confirmation workflow (identity, authorisation, audit trail) --
  the "report confirmed contamination" button is a demo control, not one
  (`SAFETY_CASE.md` H3).
- No live CQL execution engine (see the CQL note above).
- `order-select`'s CDS Hooks context doesn't carry a geocoded patient
  address the way `patient-view`'s prefetch does, so it cannot pick a river
  from a patient: its stewardship trigger stays scoped to the Mondego
  network and checks "is anything confirmed anywhere in it" — a documented
  simplification, see `orderSelect.ts`. (It is also not surfaced in the
  dashboard.) `SAFETY_CASE.md` H9.
- One network-wide mean velocity per river (Mondego 0.36 m/s, Douro 0.5,
  and a single 1.0 m/s placeholder for Tagus/Danube/Rhine/Elbe/Oder) is
  applied to every segment; no gauge data was checked for any of them. A
  real deployment would vary this per reach based on channel geometry (see
  `channelDispersion.ts` for the estimator that would support that). Every
  ETA now carries an explicit sensitivity band quantifying that, but it
  remains uncalibrated (`SAFETY_CASE.md` H5).
- Distances are straight-line between consecutive stations, so predicted
  arrival times are optimistic -- most visibly on the Danube, where
  Vukovar -> Ruse runs through non-EU Serbia and the real river path is far
  longer than the straight line.
- The auto-escalation rule (6 consecutive out-of-control ticks, fixed 0.7
  severity) **is** now characterized as a formal average run length, with
  its degradation under wrong assumptions quantified -- see `EVALUATION.md`
  -- but that characterization is simulation-only: it is not calibrated
  against any real river's telemetry, and the baseline-adequacy gate that
  would screen a real feed (`src/analytics/baseline.ts`) is not wired into
  anything. Escalation fires once per sustained event: if an operator
  clears a station manually while its underlying anomaly persists, it is
  not re-escalated until the test event is stopped and restarted.
- No GDPR consent management, Article 30 processing register, or Data
  Protection Impact Assessment; no EHDS conformance (Health Data Access
  Body process, certified EHR system). See `METHODS.md` §9 and
  `SAFETY_CASE.md` H8/§2 for what these real EU instruments require, a
  self-assessment of whether the MDR or the AI Act would apply, and why
  none of it is implemented here.
- The Incident Timeline is derived client-side from already-polled state,
  not a persisted server-side event log -- reloading the page clears it
  (same in-memory-only caveat as the rest of this prototype).
- The citizen-report endpoints have no rate-limiting, submitter identity,
  or abuse/coordinated-false-reporting detection -- anyone can submit any
  number of reports for any station (`SAFETY_CASE.md` H13.5). There is
  also no formal EU AI Act conformity assessment of the triage classifier,
  only the self-assessment in `SAFETY_CASE.md` section 2.2 (H13.6).

## Clinical & regulatory status

**This is prototype/demo code. It is not a cleared or certified medical
device, has not been clinically validated, and must not be used to guide
real patient care.** It was built for a hackathon-style engineering
exercise. Real deployment of anything like this needs the regulatory
pathway appropriate to clinical decision support software in the relevant
jurisdiction (e.g. EU MDR/IVDR for software as a medical device), a real
safety/hazard analysis, and sign-off from the clinical teams who would
actually use it.

**`SAFETY_CASE.md`** is the developers' own attempt at exactly that
analysis, done honestly rather than skipped: an intended-use statement, a
self-assessment against MDR Rule 11 (quoting MDCG 2019-11) and the AI Act's
definition guidelines (now covering both the detector and the citizen
triage classifier separately -- they read differently), and a 13-hazard
log where every claimed control traces to an automated test
(`test/safetyCase.test.ts` enforces that link).
It is explicitly **not** a substitute for a real regulatory or clinical
safety review -- it says so on its first line.
