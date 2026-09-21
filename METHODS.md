# Methods

This document states the governing equations, parameter provenance, and
validation behind `oah-mondego`'s forecasting pipeline, in the register of
a methods section rather than a README -- what's assumed, what's derived,
what's checked, and what isn't. Every citation below was independently
verified against a public source before being included (see each
subsection); nothing here is asserted on recollection alone. For the
plain-language "what's real vs illustrative" summary, see `README.md`.

Sections 1-5 below describe the transport/forecasting model in terms of
the original Mondego network; the same equations, code
(`src/hydrology/*.ts`), and validation apply unchanged to every river added
since (Douro, Tagus, Danube, Rhine, Elbe, Oder -- each a data file in
`src/data/`, all listed in `src/data/catchments.ts`). See §6b for the
Douro's provenance, §6c for the five later rivers, and §8 for the
statistical early-warning layer that covers every river's stations from
one shared implementation.

## 1. Governing equation

Transport of a dissolved contaminant in a river reach is modeled by the
1D advection-dispersion equation (ADE):

```
dC/dt + u (dC/dx) = D (d^2C/dx^2)
```

where `C(x,t)` is concentration, `u` is the cross-sectionally averaged
mean velocity, and `D` is the longitudinal dispersion coefficient. This is
the standard governing equation for well-mixed open-channel transport
(Fischer, List, Koh, Imberger & Brooks, *Mixing in Inland and Coastal
Waters*, Academic Press, 1979 -- the foundational reference for this whole
model, independently confirmed to exist and be the standard citation for
open-channel shear dispersion via multiple secondary sources).

## 2. Closed-form solution used for forecasting

`src/hydrology/advectionDispersion.ts` uses the Taylor-dispersion
(moment-matching) approximation: for an instantaneous release, the
concentration *time series observed at a fixed downstream distance x* is
approximately Gaussian, with

```
peak (centroid) time:   t_peak  = x / u
temporal variance:      sigma_t^2 = 2 D x / u^3
```

**This is an approximation, not the exact ADE solution** -- it is valid in
the large-Peclet-number regime (advection dominates dispersion). Section 4
below validates it directly against a numerical solution of the actual
governing equation, rather than asserting validity.

`src/hydrology/advectionDispersion.ts::arrivalProbability` derives a
probability of arrival-by-time-t as the CDF of this same Gaussian,
`Phi((t - t_peak) / sigma_t)`, via the Abramowitz & Stegun (1964, *Handbook
of Mathematical Functions*, formula 7.1.26) rational approximation to the
standard normal CDF -- a standard, citable numerical approximation (max
error ~1.5e-7), not a curve fit. This replaced an earlier ad hoc,
severity-weighted heuristic that had no defined relationship to the
transport model; the CDF-based version means one specific, stated thing
and is derived from the same physics as the rest of the forecast.

## 3. Dispersion coefficient

Two options are provided, both in `src/hydrology/`:

- **Flat documented default** (`DEFAULT_DISPERSION_COEFFICIENT_M2_S = 8`
  m^2/s, in `advectionDispersion.ts`): within Fischer et al.'s reported
  typical range for small-to-medium channels, but not calibrated to the
  real Mondego -- used throughout this module because no surveyed channel
  geometry for the Ponte da Portela reach was available.
- **Physically-grounded estimator** (`channelDispersion.ts`), Fischer's
  (1979) predictive equation, also reported with an explicit channel-shape
  correction factor beta in Liu, H. (1977), "Predicting Dispersion
  Coefficient of Streams", *ASCE Journal of the Environmental Engineering
  Division*, 103(1), 59-69:

  ```
  D_L = beta * 0.011 * U^2 * W^2 / (H * U*)
  ```

  where `U` is mean velocity, `W` is channel width, `H` is mean depth, and
  `U*` is shear velocity (estimated as `sqrt(g H S)` from depth and slope
  when not measured directly). **Independently confirmed** against two
  secondary sources reporting the same 0.011 coefficient and functional
  form before implementation (not taken from a single, possibly-wrong
  source). Available for a deployment with real APA/SNIRH channel-geometry
  survey data; not used for the Mondego default because that data doesn't
  exist in this project.

`pecletNumber(u, L, D) = uL/D` is exposed so a caller can check which
regime a given forecast sits in, rather than assuming validity blindly.
For the real reach parameters used throughout this module (u=0.36 m/s,
L=3850 m, D=8 m^2/s), Pe ~ 173 -- comfortably in the advection-dominated
regime the Taylor approximation targets.

## 4. Numerical validation

`src/hydrology/numericalValidation.ts` solves the actual governing PDE
(section 1) directly, via an explicit first-order-upwind (advection) +
central-difference (diffusion) finite-difference scheme, independent of
the closed-form formula. `test/numericalValidation.test.ts` compares the
two:

- Peak (mean arrival) time: closed-form vs. numerically-observed
  concentration-weighted mean, at a representative Pe ~ 40 test case --
  **agree within 10%**.
- Temporal spread: closed-form `sigma_t` vs. numerically-observed
  concentration-weighted standard deviation -- **agree within 15%**.

The remaining discrepancy is understood, not unexplained noise: first-order
upwind advection has leading-order truncation error equivalent to an
*additional* numerical diffusion term of order `u dx/2` (here, ~0.2 m^2/s
against a physical D of 1 m^2/s in the test case -- a non-trivial fraction
of the signal), and the numerical scheme starts from a finite-width
Gaussian pulse rather than a true delta-function release, adding a small
amount of extra initial variance. Both effects push the numerical spread
estimate *above* the true physical value, which is exactly the direction
and rough magnitude observed. A higher-order advection scheme or finer
grid would tighten this further; this validation establishes that the
closed-form approximation is *consistent with the governing PDE it claims
to approximate*, which a suite of unit tests checking the closed-form
formula's arithmetic against itself cannot establish on its own.

Stability is enforced, not assumed: the solver checks the advective
Courant number (`u dt/dx <= 1`) and diffusion number (`D dt/dx^2 <= 0.5`)
and throws rather than silently returning an unstable, meaningless result
(`test/numericalValidation.test.ts` includes a test asserting this).

## 5. EU Water Framework Directive (2000/60/EC) classification

The WFD's real 5-class Ecological Quality Ratio system (High / Good /
Moderate / Poor / Bad, EQR normalized to [0,1] where 1.0 = undisturbed
reference conditions) is confirmed via EUR-Lex and multiple secondary
academic sources and correctly represented in
`src/hydrology/wfdClassification.ts`.

**What is not conformant**: official WFD classification (a) derives
status from *biological, chemical, and hydromorphological* quality
elements assessed separately against water-body-type-specific reference
conditions set through a formal EU intercalibration exercise, and (b) uses
a documented "one-out-all-out" rule -- the overall class is the *worst* of
the individual element classes, not a blended score. This module maps a
single illustrative contamination-severity index onto the five class names
with linear, tunable boundaries (see numeric values and rationale in
`wfdClassification.ts`) -- a demonstration of the framework's *shape*, not
a conformant Portuguese APA assessment. This is stated directly in the
module docstring and the dashboard's "What's verified vs illustrative"
panel, not left implicit.

## 6. Clinical rationale: waterborne leptospirosis exposure

The clinical framing (flag a precautionary/active-exposure CDS card for
waterborne biohazard exposure, naming leptospirosis) is grounded in
real, verified epidemiology, not an assumed association:

- Naing, C., Reid, S.A., Aye, S.N., Htet, N.H., Ambu, S. (2019),
  **"Risk factors for human leptospirosis following flooding: A
  meta-analysis of observational studies"**, *PLoS One* 14(5): e0217643.
  PMID: 31141558, PMCID: PMC6541304. Author names, journal, volume/issue
  and year independently confirmed by fetching the PMC record directly
  (not recalled). Pooled across 14 observational studies: **OR 2.19 (95%
  CI 1.48-3.24)** for leptospirosis following flood-water exposure;
  case-control designs alone showed a stronger association (OR 4.01, 95%
  CI 1.26-12.72).
- Multiple documented historical urban post-flood leptospirosis outbreaks
  were independently confirmed via public sources, including Jakarta
  (2002), Manila/the Philippines (2009), and the 2024 floods in Rio Grande
  do Sul, Brazil (PMCID: PMC12309501).
- **European Environment Agency** (fetched directly from
  eea.europa.eu/en/newsroom/news/climate-health-risks-posed-by-floods):
  "Between 1980 and 2022, 5,584 flood-related deaths were recorded in the
  32 EEA member countries"; "around 53 million people (12% of Europe's
  population) live in areas potentially prone to river flooding"; and,
  most directly relevant to this model's premise, **"heavy rainfall events
  make it twice as likely to have harmful pathogen concentrations in water
  bodies due to contaminated run-off and combined sewage overflows."** This
  is real-world, EU-specific evidence for the general flood-to-pathogen
  mechanism this demo simulates, independent of the leptospirosis-specific
  studies above.

This does not establish that any *specific* simulated event in this demo
reflects real Mondego conditions (it doesn't -- see README's provenance
table); it establishes that the clinical concern the CDS card raises
(flood/sewage-water exposure -> elevated waterborne-pathogen risk
warranting precautionary workup) is a real, published, quantified
epidemiological relationship in a European context specifically, not an
invented plot device.

## 6a. The Mondego itself is a documented, real contamination site

Independent of the illustrative transport parameters in sections 2-3, the
Mondego at Coimbra has **directly measured, published contamination**, not
merely a plausible-sounding premise:

- Kötke, D., Gandrass, J., Bento, C.P.M., Ferreira, C.S.S., Ferreira, A.J.D.
  (2024), **"Occurrence and environmental risk assessment of
  pharmaceuticals in the Mondego river (Portugal)"**, *Heliyon* 10(15):
  e34825. DOI: 10.1016/j.heliyon.2024.e34825. Author names, journal, and
  DOI independently confirmed by fetching the PMC record directly. Key
  finding: pharmaceutical concentrations rose **~40-fold immediately
  downstream of Coimbra's wastewater treatment plant discharge**, with
  carbamazepine reaching a maximum environmental risk quotient of **53**
  (RQ > 1 = high risk to aquatic life) in that stretch.
- This is real evidence of an actual, measured point-source contamination
  gradient on this exact river, at this exact city -- it does not validate
  any of this demo's specific simulated CCI values, station coordinates,
  or arrival times (those remain illustrative, see README), but it does
  establish that "a biohazard signal downstream of Coimbra on the Mondego"
  is a realistic scenario shape, not an arbitrary one invented for the demo.

## 6b. The real EU-funded research programme this case study sits alongside

OneAquaHealth is a real, currently active Horizon Europe project (CORDIS
grant ID 101086521, "Protecting urban aquatic ecosystems to promote One
Health"), independently confirmed via its official CORDIS project page:
coordinated by the **Universidade de Coimbra**, 14 partner organizations
including **HL7 Europe**, EUR 4,939,558 in EU funding, running January
2023 - December 2026. Its stated aim is an AI-based Environmental
Surveillance System giving decision-makers early-warning indicators for
urban freshwater ecosystem health.

Fetching the project's own Coimbra research-site page
(oneaquahealth.eu/research-cities/coimbra) directly surfaces an important,
honestly-disclosed distinction: the real project's Coimbra fieldwork
focuses on **small urban tributary streams** (Ribeira de Eiras, Ribeira de
Coselhas, the Fornos river at Torre de Vilela, Vale das Flores), explicitly
citing "no official monitoring of the ecological quality" of those
streams -- **not** the six named Mondego-riverbank landmarks
(Ponte de Santa Clara, the two parks, etc.) this demo's network is built
around. Those six stations were chosen for this demo because they are
real, independently geocodable public landmarks well suited to a
patient-address-proximity CDS demo, not because they are OneAquaHealth's
literal field sites. See README's provenance table for the equivalent
disclosure in plain terms.

## 6c. Five more rivers: Tagus, Danube, Rhine, Elbe, Oder

Each river's data file (`src/data/<river>Network.ts`) carries its own
docstring and a `provenance` list that the dashboard renders; this section
records the method and, above all, what was *not* confirmed.

**Method (same as the Douro).** River facts (length, basin area, source,
mouth) come from each river's own Wikipedia infobox, fetched directly.
Every station is a city or town whose own infobox coordinates were fetched
directly, with the article checked to confirm the place lies on that river.
Coordinates are therefore CITY-CENTRE points, not gauges. 23 stations,
5 rivers:

| River | Length / basin | Stations (all fetched directly) |
|---|---|---|
| Tagus | 1,007 km / 80,100 km²; 47 km Spain-Portugal border | Toledo, Abrantes, Santarém, Lisbon |
| Danube | 2,850 km / 801,463 km² | Passau, Vienna, Bratislava, Budapest, Vukovar, Ruse, Galați |
| Rhine | 1,230 km / 185,000 km² | Strasbourg, Mainz, Cologne, Lobith |
| Elbe | 1,112 km / 148,268 km² | Ústí nad Labem, Dresden, Magdeburg, Hamburg |
| Oder | 840 km / 119,074 km² | Opole, Wrocław, Frankfurt (Oder), Szczecin |

Together with Mondego (6) and Douro (4) that is 33 stations in 13 EU member
states (PT, ES, FR, DE, NL, AT, SK, HU, HR, BG, RO, CZ, PL), computed from
the data rather than asserted.

**Real water-side governance, and how strongly each was confirmed.**
- *Rhine — confirmed directly on iksr.org:* since 1985 seven international
  main warning centres cooperate within the International Warning and Alarm
  Plan Rhine, which warns and informs "the authorities and drinking water
  works in the Rhine bordering countries" of sudden pollution in the Rhine,
  Neckar, Main and minor tributaries, mainly via an internet application.
  The recipients the page names are authorities and water works.
- *Danube — confirmed only modestly:* several ICPDR pages surfaced in search
  describe an Accident Emergency Warning System that notifies downstream
  countries of accidental transboundary pollution by SMS and e-mail. The
  ICPDR site returned HTTP 403 to a direct fetch, so no operating history or
  incident counts are quoted anywhere.
- *Elbe — confirmed via search snippets, not fetched directly:* the ICPER
  (established 1990) works on an International Elbe Warning and Alarm Plan
  and on ALAMO, an alarm model that forecasts the spread of harmful
  substances. The water side therefore already forecasts spread; this
  prototype's contribution is the clinical hand-off, not the transport model.
- *Tagus — the Albufeira Convention* (see §6b), which covers the Tejo as
  well as the Douro. A pollution-notification clause was not confirmed.
- *Oder — a real failure, not an institution.* From Wikipedia's article on
  the 2022 Oder environmental disaster (fetched directly): fish die-offs
  were first reported near Oława in March 2022 and resumed at the end of
  July; on 11 August volunteers removed at least 10 tonnes from a 200 km
  stretch; over 100 tonnes were removed from Polish sections and 35 from
  German ones. A February 2023 European Commission report concluded the
  direct cause was prymnesin toxins from *Prymnesium parvum*, enabled by
  saline industrial wastewater discharge on the Polish side. The article
  states German officials complained about a lack of communication from
  Polish officials and that Polish authorities were slow to react.

**What is deliberately not claimed.**
- That this prototype would have prevented or even detected the Oder event.
  The cause was a toxic algal bloom; the demo's turbidity control chart is
  not claimed to catch that. The Oder is included for the missing
  cross-border hand-off, not the sensor.
- That any hospital exists in the loop outside Coimbra (a test asserts CHUC
  is the only named hospital in the registry).
- Two station caveats stated by the articles themselves: Strasbourg's
  coordinates are its centre on the Ill, ~4 km from the Rhine, and Lobith is
  only "traditionally" where the Rhine enters the Netherlands (really ~4 km
  upstream, near Spijk).
- The Danube's order is a course-following sequence, not a river-kilometre
  survey; the reach between Vukovar and Ruse runs through/along non-EU
  Serbia, where no station is modeled. (Rhine, Elbe, Oder and Tagus order is
  checked by test: latitude or longitude is strictly monotonic along the
  confirmed flow direction.)

**Why predicted arrival times on these rivers are optimistic.** Three
compounding, disclosed simplifications: (1) distance between consecutive
stations is the straight-line haversine, always shorter than the river
path (a Vukovar → Ruse straight line is ~570 km; the river's route through
Serbia is much longer); (2) one unverified placeholder velocity (1.0 m/s)
is used for all four large rivers, deliberately *not* differentiated river
by river because different invented numbers would imply knowledge that
isn't here; (3) the default dispersion coefficient (8 m²/s) is a
small-channel value, so plume spread — hence the width of the
arrival/clearance window — is understated on a river this size (§3's
Fischer/Liu estimator would need real channel geometry). The point the
numbers do support is scale, not precision: plume travel time is minutes on
a Coimbra reach but days on the Danube, and that lead time is the argument
for warning downstream clinicians.

## 8. Statistical early-warning layer (EWMA control chart)

Sections 1-6 above are the *transport and forecasting* model: given that a
station IS contaminated, how far and how fast does that signal propagate.
They say nothing about how a station's contamination is first detected --
`src/cdsHooks/exposureEngine.ts`'s `flagged` state was originally set only
directly by an operator (a manual "report confirmed contamination" testing
control), a deliberate simplification for demoing the transport model in
isolation, but not a claim that real contamination detection is that
simple.

`src/analytics/` adds real statistical process control over a continuous,
noisy per-station signal, rather than a human-set switch or a single-sample
hard threshold, and (see the escalation bullet below) feeds its result into
that same `flagged` state.

- **EWMA control chart** -- Roberts, S.W. (1959), "Control Chart Tests
  Based on Geometric Moving Averages", *Technometrics*, 1(3), 239-250.
  Citation (title, author, journal, volume/issue, pages) independently
  confirmed against the paper's listing on tandfonline.com and its
  reproduction at stat.cmu.edu/technometrics. `src/analytics/ewma.ts`
  implements the real recurrence
  ```
  z_t = lambda * x_t + (1 - lambda) * z_{t-1}
  ```
  with the *exact* (not asymptotic-approximation) time-varying control
  limits
  ```
  Var(z_t) = sigma0^2 * (lambda / (2 - lambda)) * (1 - (1 - lambda)^(2t))
  UCL_t/LCL_t = mu0 +/- L * sqrt(Var(z_t))
  ```
  so early-tick control limits correctly reflect that z_t is still noisier
  right after startup than it is asymptotically -- using the common
  asymptotic-only approximation from sample 1 would understate that and
  risk spurious early alarms. lambda=0.25 and L=3 are the conventional
  defaults for detecting small-to-moderate sustained shifts (three-sigma
  limits are standard industrial SPC practice; Hunter, J.S. (1986), "The
  Exponentially Weighted Moving Average", *Journal of Quality Technology*,
  18(4), 203-210, independently confirmed to exist and discuss this same
  lambda range).
- **Why EWMA and not a raw threshold**: a raw threshold only trips once a
  single sample crosses it. EWMA is a smoothed statistic with geometrically
  decaying memory, so it is sensitive to a *sustained* shift that stays
  within noisy single-sample bounds -- the realistic failure mode this
  layer targets, versus the instantaneous acute event
  `advectionDispersion.ts`'s scenario and the demo dashboard's "report
  confirmed contamination" testing control both model. The two detection
  modes are complementary, not competing.
- **Synthetic telemetry** (`src/analytics/telemetryStream.ts`): a Gaussian
  (Box-Muller) noise process around a documented, illustrative turbidity
  baseline (15 +/- 3 NTU), with a sustained +45 NTU mean-shift standing in
  for a real contamination event's onset -- illustrative magnitudes, not
  measured Mondego sensor data, same disclosure as section 3's dispersion
  default.
- **Independently tested, not just asserted**: `test/ewma.test.ts` checks
  the control-limit formula against its closed form at tick 1 and its
  asymptotic value after many ticks, confirms a stationary in-control
  process rarely false-alarms, and confirms a sustained shift is detected
  within a bounded number of samples. `test/telemetryStream.test.ts` and
  `test/earlyWarningEngine.test.ts` check the noise generator's statistics
  and the full per-station wiring, including that an unflagged station
  stays in control while an injected one is correctly detected.
- **Escalation: detection is fused into the exposure engine, with a
  debounce.** A station that stays out of control for
  `ESCALATION_THRESHOLD_TICKS = 5` *consecutive* ticks is auto-escalated
  (`src/analytics/earlyWarningEngine.ts`) by calling its own network's
  `setStationState(..., 'statistical-detection')`, after which the normal
  chain runs unchanged: downstream forecast -> FHIR `RiskAssessment` ->
  (Mondego only) CDS Hooks card. Design decisions worth stating plainly:
  - *Debounce, not a hair trigger.* One out-of-control tick never
    escalates; the EWMA's 3-sigma limits rarely but not never false-alarm
    (`test/ewma.test.ts` asserts fewer than 5 over 300 in-control ticks --
    a loose bound, not a measured rate), and across 10 stations on a ~1.2s
    clock a lone blip will occasionally occur. The Incident Timeline
    narrates those as "returned to normal before the escalation threshold
    -- correctly not escalated."
  - *Idempotent and non-clobbering.* Escalation happens once per event and
    only if the station isn't already flagged, so it never resets an
    existing `flaggedAt` (which would freeze the downstream plume in its
    "predicted" phase forever) and never overwrites an operator's report
    (both covered in `test/earlyWarningEngine.test.ts`). The `autoEscalated`
    latch resets only when the test event is stopped/cleared.
  - *Provenance is preserved end to end.* Each flag carries `confirmedVia`
    (`'operator'` | `'statistical-detection'`). The turbidity signal never
    observes a pathogen, so a CDS card for an auto-escalated station says
    it was "auto-escalated from a sustained statistical turbidity anomaly
    (an inferred early-warning signal, not a direct pathogen or biohazard
    measurement)" and never claims a direct biohazard signature
    (`test/cdsHooks.test.ts`, "card provenance wording").
  - *Not calibrated.* The 5-tick run length and the fixed 0.7 severity
    given to an auto-escalation (vs. 0.9 for an operator report) are
    illustrative, documented choices. The scheme's false-alarm and
    detection-delay behaviour is not characterized as a formal average run
    length (ARL), which a real deployment would need to set the run length
    against an acceptable false-alert rate.
  - *A policy decision, not just a code rule.* Letting a purely
    statistical signal reach a clinician with no human confirmation raises
    alert-fatigue and regulatory-classification questions (§9) that this
    prototype does not resolve; it exists to demonstrate the end-to-end
    interoperability chain.
- **Scaling consequence, and how the timeline handles it.** With 33
  stations on a ~1.2 s clock, single out-of-control ticks (which a 3-sigma
  EWMA produces at roughly 1 in 370 station-ticks in steady state) occur
  every few seconds somewhere in the network. The dashboard's Incident
  Timeline therefore does not narrate a one-tick blip at all: an anomaly is
  narrated once it lasts 2 consecutive ticks, and escalation still requires
  5. This changes only what is *displayed* -- detection and escalation logic
  are untouched.
- **A standard this is NOT claiming conformance to**: ISO/IEEE 11073
  Personal Health Data Standards is a real, independently confirmed IEEE
  standards family (11073.org; IEEE Standards Association) -- but it
  targets personal/home health devices (weighing scales, blood-pressure
  and glucose monitors), a different device class from a river-catchment
  sensor network. Its "independent living activity hub" specialization
  (ISO/IEEE 11073-10471) does normalize simple environmental-monitor
  inputs, which is the closest real point of contact, but this prototype
  does not implement or claim conformance to 11073's device data model --
  noted here because checking and disclosing a near-miss is more honest
  than silently omitting it or force-fitting an IEEE citation that doesn't
  actually apply.

## 9. EU health-data regulatory context (not implemented, disclosed)

This prototype handles a patient's approximate home location and a
simulated clinical exposure signal -- special-category health data under
EU law if this were real. Two real, current EU legal instruments are
directly relevant, independently confirmed, and worth naming explicitly
rather than leaving this as an unaddressed gap:

- **GDPR Article 9** (Regulation (EU) 2016/679) classifies health data as
  a special category requiring an explicit legal basis beyond ordinary
  personal data. This prototype's patient geolocation is synthetic demo
  data, computed into a distance-to-nearest-station and never persisted
  (`src/cdsHooks/geolocation.ts`, `patientView.ts`) -- consistent with a
  data-minimization posture, but this prototype does **not** implement
  consent management, an Article 30 records-of-processing register, or a
  Data Protection Impact Assessment, all of which a real deployment
  handling real patient locations would require.
- **The European Health Data Space Regulation**, Regulation (EU) 2025/327,
  entered into force 26 May 2025 -- independently confirmed via its
  official text and multiple independent legal-advisory summaries. It is
  the first EU-wide legal framework for both primary use (direct care) and
  secondary use (research, policy-making) of electronic health data, and
  establishes HealthData@EU as cross-border infrastructure. This
  prototype's use of standard FHIR R4 resources and CDS Hooks is
  *directionally* aligned with EHDS's own interoperability aims, but this
  prototype implements none of EHDS's actual obligations (e.g., a
  certified EHR system, a national Health Data Access Body process) and
  makes no conformance claim to it.

Both are named here, not glossed over, for the same reason section 6b
discloses this prototype's non-affiliation with OneAquaHealth: a real
claim about real regulation is more useful to a reader than silence, and
silence would misrepresent the actual gap between this prototype and a
real, deployable EU health-data system.

## 10. What this document does not claim

- No claim that `DEFAULT_DISPERSION_COEFFICIENT_M2_S`, the reach distance,
  or the assumed velocity match the real Mondego at Ponte da Portela --
  see README's verification table.
- No claim of conformance to the HL7 Europe OneAquaHealth FHIR IG's
  RiskAssessment shape specifically -- the IG's existence and its
  Observation profile were independently confirmed, but no
  RiskAssessment-specific profile was found; see `src/fhir/riskAssessment.ts`.
- No claim that the numerical validation in section 4 constitutes formal
  verification & validation (V&V) in the regulatory sense -- it is a
  legitimate, honest cross-check between two independent solution methods,
  at the level of rigor achievable within a hackathon timeline, not a
  peer-reviewed model validation study.
- No claim of formal affiliation with, or endorsement by, the OneAquaHealth
  Horizon Europe consortium (CORDIS 101086521) -- this demo is an
  independently built prototype that reuses the same FHIR IG, targets the
  same city, and cites the same project as real-world context (section 6b),
  not a deliverable of that grant.
