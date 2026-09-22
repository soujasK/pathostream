/**
 * The hazard log behind SAFETY_CASE.md, as data, so a test can prove that
 * every control marked "implemented" points at automated evidence that
 * exists (test/safetyCase.test.ts). A control that is not built is marked
 * "open" and may carry NO evidence -- the log cannot claim what the repo
 * does not contain.
 *
 * This is a structured, ISO 14971-style hazard analysis written by the
 * developers. It is NOT a compliant risk-management file: there are no
 * approved risk-acceptability criteria, no independent review, and no
 * clinical input.
 */

/** Automated evidence: a test file and a substring of a test/describe title
 * inside it. */
export interface TestEvidence {
  file: string;
  test: string;
}

export type ControlStatus = "implemented" | "partial" | "open";
export type ControlKind = "code" | "documentation";

export interface Control {
  id: string;
  description: string;
  kind: ControlKind;
  status: ControlStatus;
  /** Automated regression evidence (required for implemented code controls unless `manual` is given). */
  evidence: TestEvidence[];
  /** Evidence that cannot be a unit test (e.g. a browser check). Flagged as
   * not regression-protected in the rendered document. */
  manual?: string;
  /** For open/partial controls: what is missing. */
  gap?: string;
}

export type ResidualLevel = "low" | "medium" | "high";

export interface Hazard {
  id: string;
  title: string;
  harm: string;
  causes: string[];
  controls: Control[];
  residual: { level: ResidualLevel; text: string };
}

const CDS = "test/cdsHooks.test.ts";
const CONF = "test/cdsConformance.test.ts";
const AUTH = "test/cdsAuth.test.ts";
const EVAL = "test/evaluation.test.ts";
const EWS = "test/earlyWarningEngine.test.ts";

export const HAZARDS: Hazard[] = [
  {
    id: "H1",
    title: "A false alarm reaches a clinician",
    harm: "Unnecessary investigation or treatment of a patient; alert fatigue that erodes trust in true alerts.",
    causes: [
      "The statistical detector false-alarms (its rate depends heavily on baseline assumptions -- EVALUATION.md section 4).",
      "The baseline is estimated from too little data or from autocorrelated readings.",
      "Living within 2 km of a station is not evidence of exposure.",
      "An operator reports contamination in error (H3).",
    ],
    controls: [
      {
        id: "H1.1",
        description:
          "Escalation requires k consecutive out-of-control readings; k = 5 is the smallest value meeting an explicit, stated false-escalation target, derived from a seeded simulation rather than chosen by feel.",
        kind: "code",
        status: "implemented",
        evidence: [
          { file: EVAL, test: "supports the shipped escalation threshold: it is the smallest k meeting the stated design target" },
          { file: EWS, test: "does not escalate a Mondego station before ESCALATION_THRESHOLD_TICKS consecutive out-of-control ticks" },
        ],
      },
      {
        id: "H1.2",
        description:
          "A baseline-adequacy gate (at least 200 readings; bounded lag-1 autocorrelation) that a real sensor feed must pass before a chart is built from it. Thresholds come from the measured behaviour in EVALUATION.md section 5.",
        kind: "code",
        status: "partial",
        evidence: [
          { file: EVAL, test: "rejects a window shorter than the minimum" },
          { file: EVAL, test: "rejects a strongly autocorrelated baseline even when long" },
        ],
        gap: "Implemented and tested but NOT wired into any data path: the demo telemetry is synthetic with a known baseline. It is a coarse screen (it rejects a phi = 0.1 baseline only about a quarter of the time at n = 200).",
      },
      {
        id: "H1.3",
        description: "Signals inferred from statistics alone are presented as unconfirmed at reduced urgency (see H2).",
        kind: "code",
        status: "implemented",
        evidence: [{ file: CDS, test: "downgrades an auto-escalated station's own card to 'warning', labelled unconfirmed" }],
      },
      {
        id: "H1.4",
        description:
          "Post-deployment measurement: the CDS Hooks feedback endpoint records accepted/overridden outcomes and coded override reasons, and /monitoring/feedback reports the override rate.",
        kind: "code",
        status: "implemented",
        evidence: [{ file: CONF, test: "records an override with a coded reason and counts it" }],
      },
      {
        id: "H1.5",
        description: "The detector's failure modes are quantified and published, including how far the false-alarm interval collapses when its assumptions fail.",
        kind: "documentation",
        status: "implemented",
        evidence: [
          { file: EVAL, test: "misspecified sd and strong autocorrelation collapse the false-alarm interval" },
          { file: EVAL, test: "EVALUATION.md is exactly what the renderer produces from the committed results" },
        ],
      },
    ],
    residual: {
      level: "high",
      text: "On any real feed the false-alarm rate is unknown until that feed's baseline is measured; EVALUATION.md shows it can be one to three orders of magnitude worse than the ideal-assumptions figure. No real data were available.",
    },
  },
  {
    id: "H2",
    title: "An inferred (statistical) signal is presented as a confirmed exposure",
    harm: "Empiric therapy or testing driven by an unconfirmed turbidity trend -- the over-treatment antimicrobial stewardship exists to prevent.",
    causes: [
      "Auto-escalation marks a station confirmed from a turbidity signal alone; it never observes a pathogen.",
      "A downstream patient's card traces back to an upstream flag whose basis the clinician cannot otherwise see.",
    ],
    controls: [
      {
        id: "H2.1",
        description:
          "patient-view: an inferred flag yields a 'warning' card whose summary says 'unconfirmed', with no 'do not delay empiric therapy' directive and no order-creating suggestion. (Found and fixed during this audit: it previously produced a full-strength 'critical' card.)",
        kind: "code",
        status: "implemented",
        evidence: [
          { file: CDS, test: "downgrades an auto-escalated station's own card to 'warning', labelled unconfirmed" },
          { file: CDS, test: "drops the empiric-therapy directive and the order-creating suggestion for an inferred flag" },
        ],
      },
      {
        id: "H2.2",
        description: "The inferred basis is disclosed on a downstream patient's card, not only on the station's own.",
        kind: "code",
        status: "implemented",
        evidence: [{ file: CDS, test: "discloses the inferred trigger on a downstream patient's card once the front has arrived" }],
      },
      {
        id: "H2.3",
        description: "order-select: an inferred signal yields an 'info' card labelled unconfirmed instead of a 'warning'.",
        kind: "code",
        status: "implemented",
        evidence: [{ file: CONF, test: "order-select, inferred from a statistical signal: downgraded to info and labelled unconfirmed" }],
      },
      {
        id: "H2.4",
        description: "Confirmation provenance survives the demo's fast-forward, so an inferred flag can never silently become an 'operator' one.",
        kind: "code",
        status: "implemented",
        evidence: [{ file: CDS, test: "keeps a station's confirmation provenance when re-flagged to fast-forward its clock" }],
      },
    ],
    residual: {
      level: "medium",
      text: "Operator-confirmed flags remain full strength, and an operator can be wrong or spoofed (H3).",
    },
  },
  {
    id: "H3",
    title: "Contamination is reported falsely, or the controls are used without authority",
    harm: "False critical alerts across a network; loss of trust; misdirected clinical action.",
    causes: [
      "The /demo control routes mutate state with no authentication.",
      "Clinical endpoints are open by default, so anyone can call them.",
      "There is no operator identity, authorisation or audit trail for a confirmation.",
    ],
    controls: [
      {
        id: "H3.1",
        description: "The /demo routes can be switched off entirely (OAH_DEMO_ROUTES=off) leaving the clinical surface intact.",
        kind: "code",
        status: "implemented",
        evidence: [{ file: CONF, test: "404s every /demo route, mutating or not" }],
      },
      {
        id: "H3.2",
        description:
          "CDS Hooks JWT authentication per the spec (RS/ES asymmetric algorithms only, none and symmetric rejected; iss/aud/exp/iat/jti verified; jti replay refused; keys pre-registered by kid). Off by default so the demo runs with no setup.",
        kind: "code",
        status: "implemented",
        evidence: [
          { file: AUTH, test: "rejects the `none` algorithm" },
          { file: AUTH, test: "rejects a replayed jti" },
          { file: AUTH, test: "returns 401 with a WWW-Authenticate header when no token is sent" },
        ],
      },
      {
        id: "H3.3",
        description: "A real operator workflow for confirming contamination: identity, authorisation, four-eyes confirmation, audit trail.",
        kind: "code",
        status: "open",
        evidence: [],
        gap: "Not built. The 'operator' report today is a demo button.",
      },
    ],
    residual: {
      level: "high",
      text: "With defaults (auth off, demo routes on) the service is unauthenticated by design for demonstration; it must not be exposed as-is. Even locked down, no real operator confirmation workflow exists.",
    },
  },
  {
    id: "H4",
    title: "A real contamination event produces no card",
    harm: "A clinician does not consider waterborne exposure when it is relevant -- a missed or delayed diagnosis.",
    causes: [
      "The chart watches turbidity only: an event with no turbidity signature (for example an algal bloom, as in the 2022 Oder die-off) is invisible to it.",
      "Persistence delays escalation of subtle shifts (about 40 readings for a 1-sigma shift at k = 5).",
      "Monitoring stations are sparse; velocity may be under- or over-estimated.",
      "State is held in memory: a restart silently drops every flag (H7).",
    ],
    controls: [
      {
        id: "H4.1",
        description:
          "Limitations and detection delay are quantified and published (EVALUATION.md sections 3 and 6). The system must never present the absence of an alert as the absence of risk; the prototype's empty state says 'No active alert', deliberately not 'safe'.",
        kind: "documentation",
        status: "implemented",
        evidence: [{ file: EVAL, test: "EVALUATION.md is exactly what the renderer produces from the committed results" }],
      },
    ],
    residual: {
      level: "high",
      text: "Inherent: a monitoring-based alert cannot rule exposure out. This is why the intended purpose (section 1) is limited to prompting consideration, never to excluding a diagnosis.",
    },
  },
  {
    id: "H5",
    title: "The predicted arrival time or window is wrong or over-precise",
    harm: "A clinician misjudges when a patient could have been exposed.",
    causes: [
      "River velocity and dispersion are illustrative placeholders, not gauge data.",
      "Distances are straight-line, shorter than the real river course.",
      "A point ETA reads as more certain than it is.",
    ],
    controls: [
      {
        id: "H5.1",
        description:
          "Every ETA carries a sensitivity band from an ASSUMED velocity uncertainty (about a factor of two either way), shown in the API, the card text, the FHIR rationale and the dashboard, and labelled as a sensitivity range, not a calibrated interval. The closed-form band is checked against an independent Monte Carlo.",
        kind: "code",
        status: "implemented",
        evidence: [
          { file: "test/uncertainty.test.ts", test: "matches a direct Monte Carlo of t = x / u" },
          { file: "test/uncertainty.test.ts", test: "the predicted patient-view card states the range and that it is not a calibrated interval" },
        ],
      },
      {
        id: "H5.2",
        description: "The closed-form transport solution is validated against a direct finite-difference solution of the governing PDE (peak time within 10%).",
        kind: "code",
        status: "implemented",
        evidence: [{ file: "test/numericalValidation.test.ts", test: "matches the numerically-observed peak (mean arrival) time within 10%" }],
      },
      {
        id: "H5.3",
        description: "Each river's own assumed velocity is used and disclosed on the card, not another river's.",
        kind: "code",
        status: "implemented",
        evidence: [{ file: "test/catchments.test.ts", test: "the predicted card uses the RIVER's own assumed velocity, not Mondego's" }],
      },
      {
        id: "H5.4",
        description: "Calibration of velocity and dispersion to real gauge/tracer data for each reach.",
        kind: "code",
        status: "open",
        evidence: [],
        gap: "No gauge or tracer data used. The band shows sensitivity; it does not make the forecast accurate.",
      },
    ],
    residual: { level: "high", text: "The forecast is uncalibrated; the band is an assumption. The forecast must not be relied on for any real exposure decision." },
  },
  {
    id: "H6",
    title: "A patient is associated with the wrong station",
    harm: "A patient with no plausible exposure receives an alert, or one who has one does not.",
    causes: [
      "Proximity (2 km to the nearest station) is a crude proxy for exposure; no catchment polygon is used.",
      "The recorded address may be wrong, out of date, or missing.",
    ],
    controls: [
      {
        id: "H6.1",
        description: "A patient farther than the radius from every station gets no card; a missing or unparseable address gets no card.",
        kind: "code",
        status: "implemented",
        evidence: [{ file: CDS, test: "is silent for a patient address far from every monitored river" }],
      },
    ],
    residual: { level: "medium", text: "The 2 km radius is illustrative. Proximity to a river is not evidence of contact with it." },
  },
  {
    id: "H7",
    title: "Stale or lost state",
    harm: "An old alert stays 'critical' indefinitely, or a live alert vanishes on restart.",
    causes: [
      "A station's own flag (operator or statistical) never expires; only downstream forecast phases do.",
      "State is in-memory: nothing survives a restart, and no one is told.",
    ],
    controls: [
      {
        id: "H7.1",
        description: "Forecast-derived exposure expires: past its clearance time the card is withdrawn.",
        kind: "code",
        status: "implemented",
        evidence: [{ file: "test/exposureEngine.test.ts", test: "is 'cleared' once elapsed time passes the clearance boundary" }],
      },
      {
        id: "H7.2",
        description: "Event lifecycle: a confirmed flag should resolve when its source event ends, without dropping downstream forecasts that are still in transit; state should persist across restarts.",
        kind: "code",
        status: "open",
        evidence: [],
        gap: "Not built. Un-flagging on recovery would wrongly cancel downstream pulses still travelling, so this needs an 'event ended at' model, not a quick patch. Own flags must currently be cleared by an operator.",
      },
    ],
    residual: { level: "high", text: "Open. Acceptable only for a demonstration." },
  },
  {
    id: "H8",
    title: "Patient data is exposed or retained",
    harm: "Disclosure of health-related personal data; unlawful processing.",
    causes: [
      "Every patient-view request carries a Patient resource (address) and the hook context carries the patient id.",
      "Clinician free text in feedback can contain patient details.",
      "Logs and stores can retain what they should not.",
    ],
    controls: [
      {
        id: "H8.1",
        description: "Nothing identifying a patient is logged or stored by the service: request bodies are never logged, and this is pinned by a test, including the malformed-request error path.",
        kind: "code",
        status: "implemented",
        evidence: [{ file: CONF, test: "nothing identifying a patient reaches the console during a patient-view and a feedback call" }],
      },
      {
        id: "H8.2",
        description: "Feedback records only structured, non-identifying fields (random card uuid, outcome, reason code, timestamps); free-text comments are counted but never stored.",
        kind: "code",
        status: "implemented",
        evidence: [{ file: CONF, test: "PRIVACY: counts a clinician's free-text comment but never stores it" }],
      },
      {
        id: "H8.3",
        description: "Requests are authenticated when configured (H3.2).",
        kind: "code",
        status: "implemented",
        evidence: [{ file: AUTH, test: "serves the hook with a valid token, and refuses the same token a second time" }],
      },
      {
        id: "H8.4",
        description: "Data-protection impact assessment, legal basis, controller/processor roles, retention policy, TLS and network controls.",
        kind: "documentation",
        status: "open",
        evidence: [],
        gap: "Deployment and legal matters; none applies to a prototype that processes no real data, all apply before any real use. GDPR Art. 35 requires a DPIA prior to processing likely to result in high risk, and names large-scale processing of Art. 9 special-category data as a trigger.",
      },
    ],
    residual: { level: "medium", text: "Reasonable for the code; the legal and infrastructure controls are absent. Key retrieval by jku URL is deliberately not implemented (SSRF risk); keys are pre-registered." },
  },
  {
    id: "H9",
    title: "Poor specificity of the order-select card (alert fatigue)",
    harm: "Repeated irrelevant prompts to clinicians drafting unrelated medication orders.",
    causes: [
      "The order-select card is network-wide, not patient-aware: its hook context carries no address.",
      "It does not check that the drafted MedicationRequest is an antimicrobial.",
    ],
    controls: [
      {
        id: "H9.1",
        description: "Scoped to the Mondego network only, not surfaced in the dashboard, documented as a demo simplification; an inferred signal downgrades it to 'info' (H2.3); override rates are measurable (H1.4).",
        kind: "code",
        status: "partial",
        evidence: [{ file: CONF, test: "order-select, operator-confirmed (warning) with a subject on its ServiceRequest" }],
        gap: "The trigger itself is unchanged: it fires for any MedicationRequest while any Mondego station is flagged.",
      },
    ],
    residual: { level: "high", text: "Open for order-select. The patient-view card is the primary, patient-aware path." },
  },
  {
    id: "H10",
    title: "Silent degradation over time",
    harm: "The detector quietly stops being valid (sensor swap, seasonal shift, drift) and nobody notices.",
    causes: ["The baseline is fixed; real turbidity is seasonal and event-driven."],
    controls: [
      {
        id: "H10.1",
        description: "Baseline adequacy is checked at onboarding (H1.2); the feedback override rate is a lagging indicator (H1.4).",
        kind: "code",
        status: "partial",
        evidence: [{ file: EVAL, test: "rejects a strongly autocorrelated baseline even when long" }],
        gap: "No automated drift monitor, no periodic re-estimation, no alarm on a rising false-escalation rate.",
      },
    ],
    residual: { level: "high", text: "Open; requires real data to design against." },
  },
  {
    id: "H11",
    title: "The prototype is mistaken for validated clinical software, or synthetic data for real",
    harm: "Real reliance on numbers that are illustrative.",
    causes: ["A polished interface invites trust."],
    controls: [
      {
        id: "H11.1",
        description:
          "A persistent banner ('Research prototype - synthetic data - not a medical device'), a collapsible verified-vs-illustrative provenance panel, source labels on every card, the model card, and no profile-conformance or CE claims.",
        kind: "documentation",
        status: "implemented",
        evidence: [],
        manual: "Browser check of the banner and provenance panel (Playwright, 2026-09-22); not covered by a unit test.",
      },
    ],
    residual: { level: "low", text: "Depends on the prototype being presented with its disclosures." },
  },
];
