# Methods

This document states the governing equations, parameter provenance, and
validation behind `oah-mondego`'s forecasting pipeline, in the register of
a methods section rather than a README -- what's assumed, what's derived,
what's checked, and what isn't. Every citation below was independently
verified against a public source before being included (see each
subsection); nothing here is asserted on recollection alone. For the
plain-language "what's real vs illustrative" summary, see `README.md`.

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
  were independently confirmed via public sources, including **Mumbai
  (2000 and 2005)** -- directly relevant to the sibling Mithi River case
  study in this same repository -- alongside Jakarta (2002), Manila/the
  Philippines (2009), and the 2024 floods in Rio Grande do Sul, Brazil
  (PMCID: PMC12309501).

This does not establish that any *specific* simulated event in this demo
reflects real Mondego conditions (it doesn't -- see README's provenance
table); it establishes that the clinical concern the CDS card raises
(flood/sewage-water exposure -> elevated leptospirosis risk warranting
precautionary workup) is a real, published, quantified epidemiological
relationship, not an invented plot device.

## 7. What this document does not claim

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
