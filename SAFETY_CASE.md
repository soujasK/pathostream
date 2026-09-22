# Safety case and regulatory position

> **Read this first.** This is the developers' own analysis of a **research prototype**. It has not been reviewed by a regulator, a notified body, a clinical-safety officer, a data-protection officer or a lawyer, and it is **not legal advice**. Nothing here makes the software a medical device, certifies it, or supports any clinical use. Its purpose is to state honestly what the software is for, what regulation would apply if it were productised, what can go wrong, which controls exist and which do not.

Generated from `src/safety/hazardLog.ts` by `scripts/renderSafetyCase.ts` (do not edit by hand). `test/safetyCase.test.ts` verifies that every control marked *implemented* points at an automated test that exists, and that this file is exactly what the generator produces.

## 1. Intended purpose

**As built.** A research and demonstration prototype that shows the technical chain from river monitoring to a clinician-facing decision-support card, on **synthetic telemetry** and **illustrative hydrology**, for a hackathon. It is **not intended for clinical use**, has not been placed on the market, and makes no clinical performance claim.

**If it were ever productised** (the purpose the analysis below assumes): to give a clinician, at the point of care, information that a patient's recorded residence lies near a river reach with a possible waterborne contamination event, **to prompt consideration of waterborne exposure** in that patient's assessment.

**It must not be used to** exclude a diagnosis, to withhold or delay treatment, to make an exposure determination, or as a substitute for water-authority sampling. The absence of an alert is not evidence of the absence of exposure (hazard H4).

## 2. Regulatory position (self-assessment)

### 2.1 EU Medical Device Regulation -- does it qualify as medical device software?

Source: **MDCG 2019-11**, *Guidance on Qualification and Classification of Software in Regulation (EU) 2017/745 and 2017/746*, as published on the Commission's site (a 2019 guidance; the copy read is dated 2020-09). A Rev.1 (June 2025) exists and was **not** read; the analysis below should be re-checked against it.

The guidance's qualification steps, applied to the two halves of this project:

| Step (quoted from MDCG 2019-11) | Water-authority side (monitoring, detection, forecast, dashboard) | CDS Hooks card (patient-view / order-select) |
| --- | --- | --- |
| Step 3: does the software perform "an action on data ... beyond storage, archival, communication, simple search, lossless compression"? | Yes -- it computes statistics and forecasts. | Yes. |
| Step 4: "is the action for the benefit of individual patients?" Not for individual patients: software "intended only to aggregate population data ... as well as software intended only for epidemiological studies or registers". | **Likely no.** Environmental monitoring of river reaches, not directed at any individual patient. Contingent on its intended purpose staying that. | **Yes.** It takes a specific patient's address and tells that patient's clinician something about them. |
| The guidance's description of decision-support software: "computer based tools which combine general medical information databases and algorithms with patient-specific data. They are intended to provide healthcare professionals ... with recommendations for diagnosis, prognosis, monitoring and treatment of individual patients. Based on Figure 1, they are qualified as medical devices." | Does not combine with patient-specific data. | **Matches this description closely** (environmental data + a patient's address -> a recommendation to a clinician). |

**Classification, if the card were placed on the market.** MDR Annex VIII Rule 11 (quoted in MDCG 2019-11 section 4.2.1): *"Software intended to provide information which is used to take decisions with diagnosis or therapeutic purposes is classified as class IIa, except if such decisions have an impact that may cause: death or an irreversible deterioration of a person's state of health, in which case it is in class III; or a serious deterioration of a person's state of health or a surgical intervention, in which case it is classified as class IIb."*

- **Class IIa is the floor** for the card. Class IIb or III would depend on how serious the consequence of a wrong decision could be -- a judgement that needs a qualified regulatory assessment and clinical input, which this project does not have. **No class is claimed.**
- Placing it on the EU market would require conformity assessment under the MDR (which route is not analysed here), clinical evaluation, a quality-management system, post-market surveillance, and the other obligations of a manufacturer. None of that exists.
- Intended purpose drives everything: the guidance says classification depends on the intended purpose, so a narrower stated purpose is a real lever -- but this prototype's purpose is, by design, to advise a clinician about a patient.
- Even a research prototype used in a clinical setting is a separate question (clinical investigation rules) that is not analysed here.

### 2.2 EU AI Act -- is it an "AI system"?

Source: European Commission, *Guidelines on the definition of an artificial intelligence system established by AI Act* (C(2025) 5053 final, 29.7.2025). The guidelines are **not binding** (para. 7), `"No automatic determination or exhaustive lists of systems that either fall within or outside the definition of an AI system are possible"` (para. 62), and `"each system must be assessed based on its specific characteristics"` (para. 6).

| Component | What it is | Closest guideline language |
| --- | --- | --- |
| EWMA control chart + k-consecutive escalation | A classical statistical-process-control chart with fixed, human-chosen parameters; no parameter is learned from data in this build. | Para. 40: the definition should not cover "systems that are based on the rules defined solely by natural persons to automatically execute operations". Para. 47: systems "solely intended for descriptive analysis, hypothesis testing, and visualisation" fall outside. |
| 1D advection-dispersion transport | A closed-form physics model with placeholder parameters; nothing is trained. | Para. 43 treats physics-based systems as outside the definition; para. 48: "classical heuristic systems apply predefined rules or algorithms". |
| Exposure rules, card logic | Deterministic if/then logic. | Para. 46: "basic data processing ... fixed human-programmed rules". |
| Citizen-report triage classifier (citizen/classifier.ts) | A logistic regression whose weights are LEARNED by gradient descent from labelled training examples (scripts/trainCitizenClassifier.ts), not hand-set. | Para. 292 (context on inference-enabling techniques): "machine learning approaches that learn from data how to achieve certain objectives" -- the opposite of the "rules defined solely by natural persons" language paras. 40/46 use to exclude the components above. |

**Assessment, updated:** the EWMA detector, the transport model and the exposure/card logic still look **outside** the AI-system definition on the guidelines' own wording -- but that changed for one component. **The citizen-report triage classifier is a trained machine-learning model** (Article 3(1)'s definition centres on a system that, "for explicit or implicit objectives, infers, from the input it receives, how to generate outputs"; a fitted logistic regression is a standard example of exactly that inference, not a hand-written rule) and on our reading **likely does qualify as an AI system** under the Act -- the re-assessment trigger this document named before ("a machine-learning model is added") has now actually happened, and this section is the record of doing that re-assessment, not skipping it.

**What follows from that, and what does not.** Qualifying as an AI system is a necessary but not sufficient condition for the Act's high-risk obligations (Article 6, Annex III) -- among other things those generally attach to systems used as a safety component of, or forming part of the conformity assessment of, a product already regulated as a medical device (see section 2.1); whether that applies here depends on the same intended-use analysis as the MDR question above, which has not been done by a qualified person. No claim is made here that the classifier is or is not "high-risk" -- only that it is very likely in scope of the definition at all, which the EWMA/physics/rules components are not. The classifier's own risk controls (never auto-confirms; a human reviewer sees the full, literal feature-contribution breakdown before deciding) are recorded as hazard H13 below, and are good practice regardless of the classification question. (Where software is both medical device software and an AI system, the Commission's MDCG 2025-6 addresses the interplay; it was not read.)

### 2.3 Standards and guidance -- status

The ISO/IEC standards are paywalled; only public summaries were available, so nothing below claims to reproduce their requirements.

| Standard / guidance | Why it would matter | Status here |
| --- | --- | --- |
| ISO 14971 (medical-device risk management) | The basis for a manufacturer's risk file. | Section 3 is a structured, ISO 14971-*style* hazard analysis. It is **not** a compliant risk-management file: no approved risk-acceptability criteria, no independent review, no clinical input. |
| IEC 62304 (medical-device software lifecycle) | Software safety classes A / B / C by severity of possible harm (per public summaries: A no injury possible, B injury possible but not serious, C death or serious injury possible). | **Provisional Class B**: a wrong or missing card could contribute to non-serious harm (unnecessary testing) and the clinician is an independent control; serious harm cannot be ruled out without clinical input, so **Class C is possible**. The lifecycle activities themselves (planning, requirements, architecture, formal verification, maintenance, problem resolution) are **not** implemented as a process; the repository has version control and an automated test suite. |
| IEC 62366-1 (usability engineering) | Alert design and use error. | **Not done.** No formative or summative usability evaluation with clinicians. |
| ISO 13485 (quality management system) | Required of a manufacturer. | **Not in place.** |
| MDR clinical evaluation, post-market surveillance, vigilance | Manufacturer obligations. | **Not done.** The feedback endpoint (H1.4) is a technical enabler for monitoring alert overrides, nothing more. |
| GDPR (Regulation (EU) 2016/679) | The card path handles a patient's address in a health context. | Art. 9 (special categories, incl. health data) and Art. 25 (data protection by design and by default) apply in principle; Art. 35 requires a data-protection impact assessment *prior to* processing likely to result in high risk, naming large-scale processing of Art. 9 data. The prototype processes **no real data**; **no DPIA, legal basis or retention policy exists** (H8.4). See also METHODS.md section 9 (EHDS). |
| Reporting guidance: TRIPOD+AI (BMJ 2024), DECIDE-AI (Nature Medicine 2022) | TRIPOD+AI covers clinical *prediction models*; DECIDE-AI covers early-stage *clinical* evaluation of AI decision support. | TRIPOD+AI is **not directly applicable** (the detector is not a patient-level prediction model); EVALUATION.md is the analogous statement for the detector. DECIDE-AI would govern a first clinical evaluation, which has **not** happened. |
| Model cards (Mitchell et al., FAT* 2019) | Transparent statement of intended use, data, metrics, limits. | See MODEL_CARD.md. |
| IMDRF Good Machine Learning Practice (10 principles, final 2025) | ML-enabled medical device development. | **Not mapped.** The final IMDRF document was not read; and no machine-learning model is used in this build. |

## 3. Hazard log

Counts are *implemented / partial / open* controls. Residual risk is the developers' qualitative judgement, not a calculated figure.

| ID | Hazard | Controls (impl / partial / open) | Residual |
| --- | --- | --- | --- |
| H1 | A false alarm reaches a clinician | 5 / 1 / 1 | HIGH |
| H2 | An inferred (statistical) signal is presented as a confirmed exposure | 4 / 0 / 0 | MEDIUM |
| H3 | Contamination is reported falsely, or the controls are used without authority | 2 / 0 / 1 | HIGH |
| H4 | A real contamination event produces no card | 1 / 0 / 0 | HIGH |
| H5 | The predicted arrival time or window is wrong or over-precise | 3 / 0 / 1 | HIGH |
| H6 | A patient is associated with the wrong station | 1 / 0 / 0 | MEDIUM |
| H7 | Stale or lost state | 1 / 0 / 1 | HIGH |
| H8 | Patient data is exposed or retained | 3 / 0 / 1 | MEDIUM |
| H9 | Poor specificity of the order-select card (alert fatigue) | 0 / 1 / 0 | HIGH |
| H10 | Silent degradation over time | 0 / 1 / 0 | HIGH |
| H11 | The prototype is mistaken for validated clinical software, or synthetic data for real | 2 / 0 / 0 | LOW |
| H12 | A spoofed or compromised IoT device / external feed injects false data | 3 / 0 / 1 | MEDIUM |
| H13 | A citizen report -- malicious, mistaken, or simply wrong -- leads to an unwarranted confirmed exposure | 4 / 0 / 2 | HIGH |

**Totals:** 29 implemented, 3 partial, 8 open, across 13 hazards.

### H1 -- A false alarm reaches a clinician

**Harm:** Unnecessary investigation or treatment of a patient; alert fatigue that erodes trust in true alerts.

**Causes:**
- The statistical detector false-alarms (its rate depends heavily on baseline assumptions -- EVALUATION.md section 4).
- The baseline is estimated from too little data or from autocorrelated readings.
- Living within 2 km of a station is not evidence of exposure.
- An operator reports contamination in error (H3).

| Control | Description | Type | Status | Evidence |
| --- | --- | --- | --- | --- |
| H1.1 | Escalation requires k consecutive out-of-control readings; k is the smallest value meeting an explicit, stated false-escalation target, derived from a seeded simulation rather than chosen by feel -- and is re-derived (raised from 5 to 6) whenever the registered station count changes, because the target is network-wide. | code | implemented | `test/evaluation.test.ts` -- "supports the shipped escalation threshold: it is the smallest k meeting the stated design target"<br>`test/earlyWarningEngine.test.ts` -- "does not escalate a Mondego station before ESCALATION_THRESHOLD_TICKS consecutive out-of-control ticks" |
| H1.2 | A baseline-adequacy gate (at least 200 readings; bounded lag-1 autocorrelation) that a real sensor feed must pass before a chart is built from it. Thresholds come from the measured behaviour in EVALUATION.md section 5. Wired into the real IoT ingestion path (IOT_ARCHITECTURE.md): a device is monitored only after its own readings pass this gate, using its own measured mean/sd -- not the demo's fixed constant. | code | **partial** | `test/evaluation.test.ts` -- "rejects a window shorter than the minimum"<br>`test/evaluation.test.ts` -- "rejects a strongly autocorrelated baseline even when long"<br>`test/iotIngest.test.ts` -- "accumulates Phase-I readings and refuses to monitor until the baseline gate passes"<br>`test/iotIngest.test.ts` -- "starts monitoring once the gate passes, using THIS device's own mean/sd (not the demo's fixed constant)" |
| H1.3 | Signals inferred from statistics alone are presented as unconfirmed at reduced urgency (see H2). | code | implemented | `test/cdsHooks.test.ts` -- "downgrades an auto-escalated station's own card to 'warning', labelled unconfirmed" |
| H1.4 | Post-deployment measurement: the CDS Hooks feedback endpoint records accepted/overridden outcomes and coded override reasons, and /monitoring/feedback reports the override rate. | code | implemented | `test/cdsConformance.test.ts` -- "records an override with a coded reason and counts it" |
| H1.6 | Card detail follows the published 'Five Rights of CDS' framework's right-format principle: a short primary clinical statement, separated from (not merged into) the dense transport-model methodology caveats. Found as a real defect (156 words / ~1000 characters in one undifferentiated paragraph) and fixed by a self-review against that framework -- see CLINICAL_REVIEW.md. | code | implemented | `test/cdsHooks.test.ts` -- "card detail is split into a short primary statement and a separate caveat paragraph (Right Format)" |
| H1.7 | Suppressing re-display of the identical unconfirmed alert on every chart-open within one clinical encounter, so a long visit does not repeat the same card verbatim. | code | **OPEN** | -- |
| H1.5 | The detector's failure modes are quantified and published, including how far the false-alarm interval collapses when its assumptions fail. | documentation | implemented | `test/evaluation.test.ts` -- "misspecified sd and strong autocorrelation collapse the false-alarm interval"<br>`test/evaluation.test.ts` -- "EVALUATION.md is exactly what the renderer produces from the committed results" |

**What is missing:**
- **H1.2:** Still NOT wired into the demo's own synthetic telemetry (that stays a known, fixed baseline by construction). It IS wired into the separate, isolated IoT ingestion path -- but no physical device exists to send it real data, and the gate remains a coarse screen (it rejects a phi = 0.1 baseline only about a quarter of the time at n = 200).
- **H1.7:** Found by the CLINICAL_REVIEW.md self-review, not previously tracked. Needs a real design decision (what counts as 'the same alert' across encounters, how long suppression should last) that a clinician should make, not a developer.

**Residual risk: HIGH.** On any real feed the false-alarm rate is unknown until that feed's baseline is measured; EVALUATION.md shows it can be one to three orders of magnitude worse than the ideal-assumptions figure. No real data were available.

### H2 -- An inferred (statistical) signal is presented as a confirmed exposure

**Harm:** Empiric therapy or testing driven by an unconfirmed turbidity trend -- the over-treatment antimicrobial stewardship exists to prevent.

**Causes:**
- Auto-escalation marks a station confirmed from a turbidity signal alone; it never observes a pathogen.
- A downstream patient's card traces back to an upstream flag whose basis the clinician cannot otherwise see.

| Control | Description | Type | Status | Evidence |
| --- | --- | --- | --- | --- |
| H2.1 | patient-view: an inferred flag yields a 'warning' card whose summary says 'unconfirmed', with no 'do not delay empiric therapy' directive and no order-creating suggestion. (Found and fixed during this audit: it previously produced a full-strength 'critical' card.) | code | implemented | `test/cdsHooks.test.ts` -- "downgrades an auto-escalated station's own card to 'warning', labelled unconfirmed"<br>`test/cdsHooks.test.ts` -- "drops the empiric-therapy directive and the order-creating suggestion for an inferred flag" |
| H2.2 | The inferred basis is disclosed on a downstream patient's card, not only on the station's own. | code | implemented | `test/cdsHooks.test.ts` -- "discloses the inferred trigger on a downstream patient's card once the front has arrived" |
| H2.3 | order-select: an inferred signal yields an 'info' card labelled unconfirmed instead of a 'warning'. | code | implemented | `test/cdsConformance.test.ts` -- "order-select, inferred from a statistical signal: downgraded to info and labelled unconfirmed" |
| H2.4 | Confirmation provenance survives the demo's fast-forward, so an inferred flag can never silently become an 'operator' one. | code | implemented | `test/cdsHooks.test.ts` -- "keeps a station's confirmation provenance when re-flagged to fast-forward its clock" |

**Residual risk: MEDIUM.** Operator-confirmed flags remain full strength, and an operator can be wrong or spoofed (H3).

### H3 -- Contamination is reported falsely, or the controls are used without authority

**Harm:** False critical alerts across a network; loss of trust; misdirected clinical action.

**Causes:**
- The /demo control routes mutate state with no authentication.
- Clinical endpoints are open by default, so anyone can call them.
- There is no operator identity, authorisation or audit trail for a confirmation.

| Control | Description | Type | Status | Evidence |
| --- | --- | --- | --- | --- |
| H3.1 | The /demo routes can be switched off entirely (OAH_DEMO_ROUTES=off) leaving the clinical surface intact. | code | implemented | `test/cdsConformance.test.ts` -- "404s every /demo route, mutating or not" |
| H3.2 | CDS Hooks JWT authentication per the spec (RS/ES asymmetric algorithms only, none and symmetric rejected; iss/aud/exp/iat/jti verified; jti replay refused; keys pre-registered by kid). Off by default so the demo runs with no setup. | code | implemented | `test/cdsAuth.test.ts` -- "rejects the `none` algorithm"<br>`test/cdsAuth.test.ts` -- "rejects a replayed jti"<br>`test/cdsAuth.test.ts` -- "returns 401 with a WWW-Authenticate header when no token is sent" |
| H3.3 | A real operator workflow for confirming contamination: identity, authorisation, four-eyes confirmation, audit trail. | code | **OPEN** | -- |

**What is missing:**
- **H3.3:** Not built. The 'operator' report today is a demo button.

**Residual risk: HIGH.** With defaults (auth off, demo routes on) the service is unauthenticated by design for demonstration; it must not be exposed as-is. Even locked down, no real operator confirmation workflow exists.

### H4 -- A real contamination event produces no card

**Harm:** A clinician does not consider waterborne exposure when it is relevant -- a missed or delayed diagnosis.

**Causes:**
- The chart watches turbidity only: an event with no turbidity signature (for example an algal bloom, as in the 2022 Oder die-off) is invisible to it.
- Persistence delays escalation of subtle shifts (tens of readings for a 1-sigma shift at the shipped k -- see EVALUATION.md section 3 for the exact figure).
- Monitoring stations are sparse; velocity may be under- or over-estimated.
- State is held in memory: a restart silently drops every flag (H7).

| Control | Description | Type | Status | Evidence |
| --- | --- | --- | --- | --- |
| H4.1 | Limitations and detection delay are quantified and published (EVALUATION.md sections 3 and 6). The system must never present the absence of an alert as the absence of risk; the prototype's empty state says 'No active alert', deliberately not 'safe'. | documentation | implemented | `test/evaluation.test.ts` -- "EVALUATION.md is exactly what the renderer produces from the committed results" |

**Residual risk: HIGH.** Inherent: a monitoring-based alert cannot rule exposure out. This is why the intended purpose (section 1) is limited to prompting consideration, never to excluding a diagnosis.

### H5 -- The predicted arrival time or window is wrong or over-precise

**Harm:** A clinician misjudges when a patient could have been exposed.

**Causes:**
- River velocity and dispersion are illustrative placeholders, not gauge data.
- Distances are straight-line, shorter than the real river course.
- A point ETA reads as more certain than it is.

| Control | Description | Type | Status | Evidence |
| --- | --- | --- | --- | --- |
| H5.1 | Every ETA carries a sensitivity band from an ASSUMED velocity uncertainty (about a factor of two either way), shown in the API, the card text, the FHIR rationale and the dashboard, and labelled as a sensitivity range, not a calibrated interval. The closed-form band is checked against an independent Monte Carlo. | code | implemented | `test/uncertainty.test.ts` -- "matches a direct Monte Carlo of t = x / u"<br>`test/uncertainty.test.ts` -- "the predicted patient-view card states the range and that it is not a calibrated interval" |
| H5.2 | The closed-form transport solution is validated against a direct finite-difference solution of the governing PDE (peak time within 10%). | code | implemented | `test/numericalValidation.test.ts` -- "matches the numerically-observed peak (mean arrival) time within 10%" |
| H5.3 | Each river's own assumed velocity is used and disclosed on the card, not another river's. | code | implemented | `test/catchments.test.ts` -- "the predicted card uses the RIVER's own assumed velocity, not Mondego's" |
| H5.4 | Calibration of velocity and dispersion to real gauge/tracer data for each reach. | code | **OPEN** | -- |

**What is missing:**
- **H5.4:** No gauge or tracer data used. The band shows sensitivity; it does not make the forecast accurate.

**Residual risk: HIGH.** The forecast is uncalibrated; the band is an assumption. The forecast must not be relied on for any real exposure decision.

### H6 -- A patient is associated with the wrong station

**Harm:** A patient with no plausible exposure receives an alert, or one who has one does not.

**Causes:**
- Proximity (2 km to the nearest station) is a crude proxy for exposure; no catchment polygon is used.
- The recorded address may be wrong, out of date, or missing.

| Control | Description | Type | Status | Evidence |
| --- | --- | --- | --- | --- |
| H6.1 | A patient farther than the radius from every station gets no card; a missing or unparseable address gets no card. | code | implemented | `test/cdsHooks.test.ts` -- "is silent for a patient address far from every monitored river" |

**Residual risk: MEDIUM.** The 2 km radius is illustrative. Proximity to a river is not evidence of contact with it.

### H7 -- Stale or lost state

**Harm:** An old alert stays 'critical' indefinitely, or a live alert vanishes on restart.

**Causes:**
- A station's own flag (operator or statistical) never expires; only downstream forecast phases do.
- State is in-memory: nothing survives a restart, and no one is told.

| Control | Description | Type | Status | Evidence |
| --- | --- | --- | --- | --- |
| H7.1 | Forecast-derived exposure expires: past its clearance time the card is withdrawn. | code | implemented | `test/exposureEngine.test.ts` -- "is 'cleared' once elapsed time passes the clearance boundary" |
| H7.2 | Event lifecycle: a confirmed flag should resolve when its source event ends, without dropping downstream forecasts that are still in transit; state should persist across restarts. | code | **OPEN** | -- |

**What is missing:**
- **H7.2:** Not built. Un-flagging on recovery would wrongly cancel downstream pulses still travelling, so this needs an 'event ended at' model, not a quick patch. Own flags must currently be cleared by an operator.

**Residual risk: HIGH.** Open. Acceptable only for a demonstration.

### H8 -- Patient data is exposed or retained

**Harm:** Disclosure of health-related personal data; unlawful processing.

**Causes:**
- Every patient-view request carries a Patient resource (address) and the hook context carries the patient id.
- Clinician free text in feedback can contain patient details.
- Logs and stores can retain what they should not.

| Control | Description | Type | Status | Evidence |
| --- | --- | --- | --- | --- |
| H8.1 | Nothing identifying a patient is logged or stored by the service: request bodies are never logged, and this is pinned by a test, including the malformed-request error path. | code | implemented | `test/cdsConformance.test.ts` -- "nothing identifying a patient reaches the console during a patient-view and a feedback call" |
| H8.2 | Feedback records only structured, non-identifying fields (random card uuid, outcome, reason code, timestamps); free-text comments are counted but never stored. | code | implemented | `test/cdsConformance.test.ts` -- "PRIVACY: counts a clinician's free-text comment but never stores it" |
| H8.3 | Requests are authenticated when configured (H3.2). | code | implemented | `test/cdsAuth.test.ts` -- "serves the hook with a valid token, and refuses the same token a second time" |
| H8.4 | Data-protection impact assessment, legal basis, controller/processor roles, retention policy, TLS and network controls. | documentation | **OPEN** | -- |

**What is missing:**
- **H8.4:** Deployment and legal matters; none applies to a prototype that processes no real data, all apply before any real use. GDPR Art. 35 requires a DPIA prior to processing likely to result in high risk, and names large-scale processing of Art. 9 special-category data as a trigger.

**Residual risk: MEDIUM.** Reasonable for the code; the legal and infrastructure controls are absent. Key retrieval by jku URL is deliberately not implemented (SSRF risk); keys are pre-registered.

### H9 -- Poor specificity of the order-select card (alert fatigue)

**Harm:** Repeated irrelevant prompts to clinicians drafting unrelated medication orders.

**Causes:**
- The order-select card is network-wide, not patient-aware: its hook context carries no address.
- It does not check that the drafted MedicationRequest is an antimicrobial.
- Independently confirmed as a 'right person' violation by the CLINICAL_REVIEW.md self-review against the published Five Rights of CDS framework, not merely an internal design note.

| Control | Description | Type | Status | Evidence |
| --- | --- | --- | --- | --- |
| H9.1 | Scoped to the Mondego network only, not surfaced in the dashboard, documented as a demo simplification; an inferred signal downgrades it to 'info' (H2.3); override rates are measurable (H1.4). | code | **partial** | `test/cdsConformance.test.ts` -- "order-select, operator-confirmed (warning) with a subject on its ServiceRequest" |

**What is missing:**
- **H9.1:** The trigger itself is unchanged: it fires for any MedicationRequest while any Mondego station is flagged.

**Residual risk: HIGH.** Open for order-select. The patient-view card is the primary, patient-aware path.

### H10 -- Silent degradation over time

**Harm:** The detector quietly stops being valid (sensor swap, seasonal shift, drift) and nobody notices.

**Causes:**
- The baseline is fixed; real turbidity is seasonal and event-driven.

| Control | Description | Type | Status | Evidence |
| --- | --- | --- | --- | --- |
| H10.1 | Baseline adequacy is checked at onboarding (H1.2); the feedback override rate is a lagging indicator (H1.4). | code | **partial** | `test/evaluation.test.ts` -- "rejects a strongly autocorrelated baseline even when long" |

**What is missing:**
- **H10.1:** No automated drift monitor, no periodic re-estimation, no alarm on a rising false-escalation rate.

**Residual risk: HIGH.** Open; requires real data to design against.

### H11 -- The prototype is mistaken for validated clinical software, or synthetic data for real

**Harm:** Real reliance on numbers that are illustrative.

**Causes:**
- A polished interface invites trust.

| Control | Description | Type | Status | Evidence |
| --- | --- | --- | --- | --- |
| H11.1 | A persistent banner ('Research prototype - synthetic data - not a medical device'), a collapsible verified-vs-illustrative provenance panel, source labels on every card, the model card, and no profile-conformance or CE claims. | documentation | implemented | *manual only, not regression-protected:* Browser check of the banner and provenance panel (Playwright, 2026-09-22); not covered by a unit test. |
| H11.2 | The one genuinely live, real external signal (PEGELONLINE gauge level, IOT_ARCHITECTURE.md) is visually and textually distinct from the synthetic detection status: a separate fixed-width badge, its own colour and wording ('LIVE' + cm), a hover explanation stating it is water LEVEL and is NOT part of the contamination detector -- never merged into or confused with the station's Normal/Anomaly/Escalated pill. | code | implemented | `test/realGauges.test.ts` -- "every match's independently-fetched gauge coordinates sit within 3 km of our own station coordinates (same reach)"<br>*manual only, not regression-protected:* Browser check that the two badges render distinctly and neither's content collides with the station name at any reading length (Playwright, 2026-09-22). |

**Residual risk: LOW.** Depends on the prototype being presented with its disclosures.

### H12 -- A spoofed or compromised IoT device / external feed injects false data

**Harm:** A fabricated device reading drives a false auto-escalation; abuse of a network-reachable endpoint that did not exist before this feature.

**Causes:**
- The IoT ingestion endpoint (IOT_ARCHITECTURE.md) is, by design, reachable from outside this process -- unlike /demo, which is a same-origin dashboard convenience.
- A pre-shared device key can be extracted from a compromised physical device or leaked from wherever it is stored.
- The real external gauge endpoint depends on PEGELONLINE's own availability and integrity, outside this project's control.

| Control | Description | Type | Status | Evidence |
| --- | --- | --- | --- | --- |
| H12.1 | Per-device bearer key, constant-time compared, checked against that specific device id (a key valid for one device is rejected for another); the endpoint 503s every write while unconfigured rather than defaulting open. | code | implemented | `test/iotIngest.test.ts` -- "401s a key that is valid for a DIFFERENT device (no cross-device auth)"<br>`test/iotIngest.test.ts` -- "503s every write when no device keys are configured (never silently open)" |
| H12.2 | A device's escalation is isolated from the real per-river exposure engines and every CDS Hooks card -- a compromised device cannot, by itself, make a false alert reach a clinician. | code | implemented | `test/iotIngest.test.ts` -- "ingesting under a station's own id does not flag that station in the exposure engine" |
| H12.3 | The real gauge endpoint fails closed: a network error or malformed upstream response is a handled 'unavailable' result, never a crash or a fabricated reading. | code | implemented | `test/realGauges.test.ts` -- "degrades to a handled failure (never throws) on an HTTP error"<br>`test/realGauges.test.ts` -- "degrades to a handled failure on a malformed response shape" |
| H12.4 | Device provisioning at scale (issuing, rotating, revoking per-device keys) and a move to mutual TLS or certificate-based device identity. | code | **OPEN** | -- |

**What is missing:**
- **H12.4:** The pre-shared-key model in deviceAuth.ts is a manual, env-var-configured list -- workable for a handful of devices a developer configures by hand, not a real fleet.

**Residual risk: MEDIUM.** The blast radius of a compromised device is contained (H12.2): it can corrupt only its own isolated state, never a real alert. The blast radius of a PEGELONLINE outage or bad data is also contained (H12.3): the badge simply disappears. Neither endpoint has been through any adversarial testing beyond what these unit tests cover.

### H13 -- A citizen report -- malicious, mistaken, or simply wrong -- leads to an unwarranted confirmed exposure

**Harm:** A false confirmed-exposure card reaches a clinician, sourced from an unverified public submission rather than an instrument or a direct operator observation.

**Causes:**
- Submission is open by design (a member of the public has no API key, unlike the IoT endpoint -- H12), so anyone can submit any combination of checkboxes for any station, any number of times.
- The triage classifier (citizen/classifier.ts) is a trained ML model with ~90% held-out accuracy on synthetic data (EVALUATION-style figure, see MODEL_CARD.md) -- it is wrong some of the time, by construction, and has never seen a real citizen report.
- The classifier was assessed as likely an AI system under the EU AI Act (section 2.2) -- a different, and now real, regulatory question this project did not have before this feature existed.
- No identity, reputation, or rate-limiting exists for a submitter -- one person could submit many fabricated reports.

| Control | Description | Type | Status | Evidence |
| --- | --- | --- | --- | --- |
| H13.1 | The classifier's output is a recommendation only: it can never call into the real exposure engine. Only the explicit /promote action -- standing in for a water-authority reviewer's decision -- creates a real flag, exactly the same human-in-the-loop pattern already established for statistical detection (H2) and IoT devices (H12.2). | code | implemented | `test/citizenObservations.test.ts` -- "no station is flagged after a highly concerning submission (no promotion yet)"<br>`test/citizenObservations.test.ts` -- "this holds even for MANY concerning submissions at the same station" |
| H13.2 | The reviewer sees a literal, exact breakdown of why the model flagged a report (explainLogit: every contribution sums to the logit, not a post-hoc approximation) before deciding whether to promote it -- not a bare probability with no reasoning shown. | code | implemented | `test/citizenClassifier.test.ts` -- "the explanation's contributions sum to the logit, and every contribution names a real feature" |
| H13.3 | A promoted citizen report is honestly labelled to the clinician as citizen-originated and water-authority-reviewed (confirmedVia: 'citizen-reported'), never presented as if it were a direct operator observation or an instrument reading. | code | implemented | `test/citizenObservations.test.ts` -- "after promotion, the CDS card fires, discloses the citizen origin honestly, and is full-strength" |
| H13.4 | The classifier is evaluated honestly: held-out accuracy is reported alongside a majority-class baseline, so 'the model works' is a checkable claim, not an assertion. | documentation | implemented | `test/citizenClassifier.test.ts` -- "beat the majority-class baseline by a wide margin on held-out data -- it learned something real" |
| H13.5 | Submitter identity, reputation weighting, rate-limiting, and abuse detection for the open submission endpoint. | code | **OPEN** | -- |
| H13.6 | A formal EU AI Act conformity assessment of the triage classifier (building on the qualification discussion in section 2.2). | documentation | **OPEN** | -- |

**What is missing:**
- **H13.5:** Not built. Anyone can submit any number of reports for any station; nothing here would slow down or flag a coordinated false-reporting campaign. The human-review gate (H13.1) is the only current defence, and a reviewer facing a flood of fabricated reports is itself a workable attack on their attention, not something this project defends against.
- **H13.6:** Section 2.2 records a good-faith qualification read (likely an AI system), not a conformity assessment. Real use would need that done by a qualified person, alongside the MDR question in section 2.1.

**Residual risk: HIGH.** The human-review gate (H13.1-H13.3) means no citizen input can reach a clinician without an explicit human decision -- a materially different, safer posture than the statistical detector's auto-escalation (H1/H2). But nothing here defends against a reviewer being overwhelmed or misled at scale (H13.5), and the classifier's real-world accuracy on genuine citizen reports is unknown -- it has only ever seen synthetic data (MODEL_CARD.md).

## 4. Traceability

Every control marked *implemented* that is a code control names an automated test file and a test title; `test/safetyCase.test.ts` fails if the file is missing, if the title no longer exists in it, if an *open* control claims evidence, or if this document is stale. Controls verified only by a manual browser check are labelled as such and are **not** regression-protected.

## 5. What is still open

- **H1.2** (H1, partial): Still NOT wired into the demo's own synthetic telemetry (that stays a known, fixed baseline by construction). It IS wired into the separate, isolated IoT ingestion path -- but no physical device exists to send it real data, and the gate remains a coarse screen (it rejects a phi = 0.1 baseline only about a quarter of the time at n = 200).
- **H1.7** (H1, open): Found by the CLINICAL_REVIEW.md self-review, not previously tracked. Needs a real design decision (what counts as 'the same alert' across encounters, how long suppression should last) that a clinician should make, not a developer.
- **H3.3** (H3, open): Not built. The 'operator' report today is a demo button.
- **H5.4** (H5, open): No gauge or tracer data used. The band shows sensitivity; it does not make the forecast accurate.
- **H7.2** (H7, open): Not built. Un-flagging on recovery would wrongly cancel downstream pulses still travelling, so this needs an 'event ended at' model, not a quick patch. Own flags must currently be cleared by an operator.
- **H8.4** (H8, open): Deployment and legal matters; none applies to a prototype that processes no real data, all apply before any real use. GDPR Art. 35 requires a DPIA prior to processing likely to result in high risk, and names large-scale processing of Art. 9 special-category data as a trigger.
- **H9.1** (H9, partial): The trigger itself is unchanged: it fires for any MedicationRequest while any Mondego station is flagged.
- **H10.1** (H10, partial): No automated drift monitor, no periodic re-estimation, no alarm on a rising false-escalation rate.
- **H12.4** (H12, open): The pre-shared-key model in deviceAuth.ts is a manual, env-var-configured list -- workable for a handful of devices a developer configures by hand, not a real fleet.
- **H13.5** (H13, open): Not built. Anyone can submit any number of reports for any station; nothing here would slow down or flag a coordinated false-reporting campaign. The human-review gate (H13.1) is the only current defence, and a reviewer facing a flood of fabricated reports is itself a workable attack on their attention, not something this project defends against.
- **H13.6** (H13, open): Section 2.2 records a good-faith qualification read (likely an AI system), not a conformity assessment. Real use would need that done by a qualified person, alongside the MDR question in section 2.1.

## 6. Before any clinical use, at minimum

1. A clinical-safety and regulatory assessment by qualified people (MDR qualification and class; whether the AI Act applies).
2. Real sensor data and a labelled-event evaluation of the detector on it -- EVALUATION.md is simulation only.
3. Calibration of velocity and dispersion to gauge or tracer data per reach.
4. Usability evaluation with clinicians, then a DECIDE-AI-style early clinical evaluation.
5. Authentication on, demo routes off, a real operator confirmation workflow, an event lifecycle and persistence (H3, H7).
6. A data-protection impact assessment and the legal and infrastructure controls of H8.4.
7. A quality-management system and the manufacturer obligations of the MDR.
