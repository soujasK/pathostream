/**
 * Renders SAFETY_CASE.md from the hazard log. The hazard log is data; the
 * regulatory text is static prose that quotes only wording read directly from
 * the cited documents (MDCG 2019-11 and the Commission's AI-system-definition
 * guidelines), with step / paragraph numbers.
 */

import type { Control, Hazard } from "./hazardLog.js";

function table(headers: string[], rows: string[][]): string {
  const line = (cells: string[]) => `| ${cells.map((c) => c.replace(/\|/g, "\\|").replace(/\n/g, " ")).join(" | ")} |`;
  return [line(headers), line(headers.map(() => "---")), ...rows.map(line)].join("\n");
}

const STATUS_LABEL: Record<Control["status"], string> = {
  implemented: "implemented",
  partial: "**partial**",
  open: "**OPEN**",
};

function evidenceCell(control: Control): string {
  const parts = control.evidence.map((e) => `\`${e.file}\` -- "${e.test}"`);
  if (control.manual) parts.push(`*manual only, not regression-protected:* ${control.manual}`);
  return parts.length > 0 ? parts.join("<br>") : "--";
}

function renderHazard(h: Hazard): string {
  const rows = h.controls.map((c) => [c.id, c.description, c.kind, STATUS_LABEL[c.status], evidenceCell(c)]);
  const gaps = h.controls.filter((c) => c.gap).map((c) => `- **${c.id}:** ${c.gap}`);
  return [
    `### ${h.id} -- ${h.title}`,
    "",
    `**Harm:** ${h.harm}`,
    "",
    "**Causes:**",
    ...h.causes.map((c) => `- ${c}`),
    "",
    table(["Control", "Description", "Type", "Status", "Evidence"], rows),
    ...(gaps.length > 0 ? ["", "**What is missing:**", ...gaps] : []),
    "",
    `**Residual risk: ${h.residual.level.toUpperCase()}.** ${h.residual.text}`,
    "",
  ].join("\n");
}

export function renderSafetyCase(hazards: Hazard[]): string {
  const all = hazards.flatMap((h) => h.controls);
  const count = (s: Control["status"]) => all.filter((c) => c.status === s).length;
  const unfinished = hazards.flatMap((h) => h.controls.filter((c) => c.status !== "implemented").map((c) => ({ h, c })));

  const summaryRows = hazards.map((h) => {
    const n = (s: Control["status"]) => h.controls.filter((c) => c.status === s).length;
    return [h.id, h.title, `${n("implemented")} / ${n("partial")} / ${n("open")}`, h.residual.level.toUpperCase()];
  });

  return `# Safety case and regulatory position

> **Read this first.** This is the developers' own analysis of a **research prototype**. It has not been reviewed by a regulator, a notified body, a clinical-safety officer, a data-protection officer or a lawyer, and it is **not legal advice**. Nothing here makes the software a medical device, certifies it, or supports any clinical use. Its purpose is to state honestly what the software is for, what regulation would apply if it were productised, what can go wrong, which controls exist and which do not.

Generated from \`src/safety/hazardLog.ts\` by \`scripts/renderSafetyCase.ts\` (do not edit by hand). \`test/safetyCase.test.ts\` verifies that every control marked *implemented* points at an automated test that exists, and that this file is exactly what the generator produces.

## 1. Intended purpose

**As built.** A research and demonstration prototype that shows the technical chain from river monitoring to a clinician-facing decision-support card, on **synthetic telemetry** and **illustrative hydrology**, for a hackathon. It is **not intended for clinical use**, has not been placed on the market, and makes no clinical performance claim.

**If it were ever productised** (the purpose the analysis below assumes): to give a clinician, at the point of care, information that a patient's recorded residence lies near a river reach with a possible waterborne contamination event, **to prompt consideration of waterborne exposure** in that patient's assessment.

**It must not be used to** exclude a diagnosis, to withhold or delay treatment, to make an exposure determination, or as a substitute for water-authority sampling. The absence of an alert is not evidence of the absence of exposure (hazard H4).

## 2. Regulatory position (self-assessment)

### 2.1 EU Medical Device Regulation -- does it qualify as medical device software?

Source: **MDCG 2019-11**, *Guidance on Qualification and Classification of Software in Regulation (EU) 2017/745 and 2017/746*, as published on the Commission's site (a 2019 guidance; the copy read is dated 2020-09). A Rev.1 (June 2025) exists and was **not** read; the analysis below should be re-checked against it.

The guidance's qualification steps, applied to the two halves of this project:

${table(
  ["Step (quoted from MDCG 2019-11)", "Water-authority side (monitoring, detection, forecast, dashboard)", "CDS Hooks card (patient-view / order-select)"],
  [
    ["Step 3: does the software perform \"an action on data ... beyond storage, archival, communication, simple search, lossless compression\"?", "Yes -- it computes statistics and forecasts.", "Yes."],
    [
      "Step 4: \"is the action for the benefit of individual patients?\" Not for individual patients: software \"intended only to aggregate population data ... as well as software intended only for epidemiological studies or registers\".",
      "**Likely no.** Environmental monitoring of river reaches, not directed at any individual patient. Contingent on its intended purpose staying that.",
      "**Yes.** It takes a specific patient's address and tells that patient's clinician something about them.",
    ],
    [
      "The guidance's description of decision-support software: \"computer based tools which combine general medical information databases and algorithms with patient-specific data. They are intended to provide healthcare professionals ... with recommendations for diagnosis, prognosis, monitoring and treatment of individual patients. Based on Figure 1, they are qualified as medical devices.\"",
      "Does not combine with patient-specific data.",
      "**Matches this description closely** (environmental data + a patient's address -> a recommendation to a clinician).",
    ],
  ],
)}

**Classification, if the card were placed on the market.** MDR Annex VIII Rule 11 (quoted in MDCG 2019-11 section 4.2.1): *"Software intended to provide information which is used to take decisions with diagnosis or therapeutic purposes is classified as class IIa, except if such decisions have an impact that may cause: death or an irreversible deterioration of a person's state of health, in which case it is in class III; or a serious deterioration of a person's state of health or a surgical intervention, in which case it is classified as class IIb."*

- **Class IIa is the floor** for the card. Class IIb or III would depend on how serious the consequence of a wrong decision could be -- a judgement that needs a qualified regulatory assessment and clinical input, which this project does not have. **No class is claimed.**
- Placing it on the EU market would require conformity assessment under the MDR (which route is not analysed here), clinical evaluation, a quality-management system, post-market surveillance, and the other obligations of a manufacturer. None of that exists.
- Intended purpose drives everything: the guidance says classification depends on the intended purpose, so a narrower stated purpose is a real lever -- but this prototype's purpose is, by design, to advise a clinician about a patient.
- Even a research prototype used in a clinical setting is a separate question (clinical investigation rules) that is not analysed here.

### 2.2 EU AI Act -- is it an "AI system"?

Source: European Commission, *Guidelines on the definition of an artificial intelligence system established by AI Act* (C(2025) 5053 final, 29.7.2025). The guidelines are **not binding** (para. 7), \`"No automatic determination or exhaustive lists of systems that either fall within or outside the definition of an AI system are possible"\` (para. 62), and \`"each system must be assessed based on its specific characteristics"\` (para. 6).

${table(
  ["Component", "What it is", "Closest guideline language"],
  [
    ["EWMA control chart + k-consecutive escalation", "A classical statistical-process-control chart with fixed, human-chosen parameters; no parameter is learned from data in this build.", "Para. 40: the definition should not cover \"systems that are based on the rules defined solely by natural persons to automatically execute operations\". Para. 47: systems \"solely intended for descriptive analysis, hypothesis testing, and visualisation\" fall outside."],
    ["1D advection-dispersion transport", "A closed-form physics model with placeholder parameters; nothing is trained.", "Para. 43 treats physics-based systems as outside the definition; para. 48: \"classical heuristic systems apply predefined rules or algorithms\"."],
    ["Exposure rules, card logic", "Deterministic if/then logic.", "Para. 46: \"basic data processing ... fixed human-programmed rules\"."],
    ["Citizen-report triage classifier (citizen/classifier.ts)", "A logistic regression whose weights are LEARNED by gradient descent from labelled training examples (scripts/trainCitizenClassifier.ts), not hand-set.", "Para. 292 (context on inference-enabling techniques): \"machine learning approaches that learn from data how to achieve certain objectives\" -- the opposite of the \"rules defined solely by natural persons\" language paras. 40/46 use to exclude the components above."],
  ],
)}

**Assessment, updated:** the EWMA detector, the transport model and the exposure/card logic still look **outside** the AI-system definition on the guidelines' own wording -- but that changed for one component. **The citizen-report triage classifier is a trained machine-learning model** (Article 3(1)'s definition centres on a system that, "for explicit or implicit objectives, infers, from the input it receives, how to generate outputs"; a fitted logistic regression is a standard example of exactly that inference, not a hand-written rule) and on our reading **likely does qualify as an AI system** under the Act -- the re-assessment trigger this document named before ("a machine-learning model is added") has now actually happened, and this section is the record of doing that re-assessment, not skipping it.

**What follows from that, and what does not.** Qualifying as an AI system is a necessary but not sufficient condition for the Act's high-risk obligations (Article 6, Annex III) -- among other things those generally attach to systems used as a safety component of, or forming part of the conformity assessment of, a product already regulated as a medical device (see section 2.1); whether that applies here depends on the same intended-use analysis as the MDR question above, which has not been done by a qualified person. No claim is made here that the classifier is or is not "high-risk" -- only that it is very likely in scope of the definition at all, which the EWMA/physics/rules components are not. The classifier's own risk controls (never auto-confirms; a human reviewer sees the full, literal feature-contribution breakdown before deciding) are recorded as hazard H13 below, and are good practice regardless of the classification question. (Where software is both medical device software and an AI system, the Commission's MDCG 2025-6 addresses the interplay; it was not read.)

### 2.3 Standards and guidance -- status

The ISO/IEC standards are paywalled; only public summaries were available, so nothing below claims to reproduce their requirements.

${table(
  ["Standard / guidance", "Why it would matter", "Status here"],
  [
    ["ISO 14971 (medical-device risk management)", "The basis for a manufacturer's risk file.", "Section 3 is a structured, ISO 14971-*style* hazard analysis. It is **not** a compliant risk-management file: no approved risk-acceptability criteria, no independent review, no clinical input."],
    ["IEC 62304 (medical-device software lifecycle)", "Software safety classes A / B / C by severity of possible harm (per public summaries: A no injury possible, B injury possible but not serious, C death or serious injury possible).", "**Provisional Class B**: a wrong or missing card could contribute to non-serious harm (unnecessary testing) and the clinician is an independent control; serious harm cannot be ruled out without clinical input, so **Class C is possible**. The lifecycle activities themselves (planning, requirements, architecture, formal verification, maintenance, problem resolution) are **not** implemented as a process; the repository has version control and an automated test suite."],
    ["IEC 62366-1 (usability engineering)", "Alert design and use error.", "**Not done.** No formative or summative usability evaluation with clinicians."],
    ["ISO 13485 (quality management system)", "Required of a manufacturer.", "**Not in place.**"],
    ["MDR clinical evaluation, post-market surveillance, vigilance", "Manufacturer obligations.", "**Not done.** The feedback endpoint (H1.4) is a technical enabler for monitoring alert overrides, nothing more."],
    ["GDPR (Regulation (EU) 2016/679)", "The card path handles a patient's address in a health context.", "Art. 9 (special categories, incl. health data) and Art. 25 (data protection by design and by default) apply in principle; Art. 35 requires a data-protection impact assessment *prior to* processing likely to result in high risk, naming large-scale processing of Art. 9 data. The prototype processes **no real data**; **no DPIA, legal basis or retention policy exists** (H8.4). See also METHODS.md section 9 (EHDS)."],
    ["Reporting guidance: TRIPOD+AI (BMJ 2024), DECIDE-AI (Nature Medicine 2022)", "TRIPOD+AI covers clinical *prediction models*; DECIDE-AI covers early-stage *clinical* evaluation of AI decision support.", "TRIPOD+AI is **not directly applicable** (the detector is not a patient-level prediction model); EVALUATION.md is the analogous statement for the detector. DECIDE-AI would govern a first clinical evaluation, which has **not** happened."],
    ["Model cards (Mitchell et al., FAT* 2019)", "Transparent statement of intended use, data, metrics, limits.", "See MODEL_CARD.md."],
    ["IMDRF Good Machine Learning Practice (10 principles, final 2025)", "ML-enabled medical device development.", "**Not mapped.** The final IMDRF document was not read; and no machine-learning model is used in this build."],
  ],
)}

## 3. Hazard log

Counts are *implemented / partial / open* controls. Residual risk is the developers' qualitative judgement, not a calculated figure.

${table(["ID", "Hazard", "Controls (impl / partial / open)", "Residual"], summaryRows)}

**Totals:** ${count("implemented")} implemented, ${count("partial")} partial, ${count("open")} open, across ${hazards.length} hazards.

${hazards.map(renderHazard).join("\n")}
## 4. Traceability

Every control marked *implemented* that is a code control names an automated test file and a test title; \`test/safetyCase.test.ts\` fails if the file is missing, if the title no longer exists in it, if an *open* control claims evidence, or if this document is stale. Controls verified only by a manual browser check are labelled as such and are **not** regression-protected.

## 5. What is still open

${unfinished.map(({ h, c }) => `- **${c.id}** (${h.id}, ${c.status}): ${c.gap ?? c.description}`).join("\n")}

## 6. Before any clinical use, at minimum

1. A clinical-safety and regulatory assessment by qualified people (MDR qualification and class; whether the AI Act applies).
2. Real sensor data and a labelled-event evaluation of the detector on it -- EVALUATION.md is simulation only.
3. Calibration of velocity and dispersion to gauge or tracer data per reach.
4. Usability evaluation with clinicians, then a DECIDE-AI-style early clinical evaluation.
5. Authentication on, demo routes off, a real operator confirmation workflow, an event lifecycle and persistence (H3, H7).
6. A data-protection impact assessment and the legal and infrastructure controls of H8.4.
7. A quality-management system and the manufacturer obligations of the MDR.
`;
}
