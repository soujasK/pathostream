# Clinical alert-design self-review

> **What this is, and what it is not.** `SAFETY_CASE.md` names "no clinician ever reviewed this alert design" as a real, unfixed gap. This document does **not** fix that gap -- it cannot be fixed without an actual clinician. What it is: a structured self-critique of the CDS Hooks `patient-view` and `order-select` cards against a published, citable clinical-decision-support framework, done honestly and in the open, so the design was at least checked against real literature rather than shipped on instinct. **This is not a substitute for real clinician review** -- a domain expert may find real problems this review, written by the people who built the system, cannot see.

**Framework used:** the "Five Rights of Clinical Decision Support" -- right information, right person, right format, right channel, right time in workflow. First articulated by Osheroff et al. (2007) and adopted by, among others, the U.S. Agency for Healthcare Research and Quality (AHRQ). Verified directly against AHRQ's own published description before use here (not recalled): "getting the right information, to the right stakeholder, at the right point in workflow, through the right channel, and the right format" ([digital.ahrq.gov, "Overview of CDS Five Rights"](https://digital.ahrq.gov/ahrq-funded-projects/current-health-it-priorities/clinical-decision-support-cds/chapter-1-approaching-clinical-decision/section-2-overview-cds-five-rights)).

## 1. Right information

*Is the content relevant and evidence-based?*

**Findings:**
- The clinical rationale (leptospirosis risk after flood/waterborne exposure) is a real, cited association (Naing et al. 2019, *PLoS One* 14(5):e0217643, pooled OR 2.19 across 14 studies -- see `METHODS.md` §6), not an invented one.
- The suggested test (LOINC 82195-9, a stool GI pathogen NAA panel) and the diagnosis code (SNOMED CT 77377001, leptospirosis) are both independently verified against their code systems (`README.md`, "Verified codes"), and now against the official HL7 FHIR validator for structural conformance (`conformance/README.md`).
- Every number the card states about the *model's own confidence* is honest, not just present: the arrival-time band is explicitly labelled a sensitivity range, not a calibrated interval (`SAFETY_CASE.md` H5.1); an inferred (statistical) flag is explicitly labelled unconfirmed (H2).

**No changes made here** -- this right was already reasonably well served; see `EVALUATION.md` and `SAFETY_CASE.md` §2 for the deeper, separate question of whether the underlying detector itself is trustworthy (a different question from whether the *card's information* is honestly presented).

## 2. Right person

*Is the alert targeted at whoever can actually act on it, and only them?*

**Findings:**
- `patient-view` fires when a clinician opens a *specific* patient's chart, and is silent unless that patient's own recorded address is near a monitored station (`test/cdsHooks.test.ts`, "is silent for a patient address far from every monitored river"). This is the correct hook for a patient-specific signal.
- `order-select` is **not** patient-specific: its CDS Hooks context carries no patient location, so it fires for *any* patient whose clinician is drafting a medication order while *any* Mondego station is flagged -- already identified and tracked as `SAFETY_CASE.md` hazard H9, not new. This review confirms it independently as a genuine "right person" violation, not just a "right format" one: a clinician treating an unrelated patient's ear infection could see a waterborne-stewardship prompt that has nothing to do with that patient.

**Not fixed here** -- doing so properly needs `order-select` to carry a patient location, which the CDS Hooks 2.0 `order-select` hook context does not provide; it would require either prefetching the patient's address (as `patient-view` does) or scoping differently. That is real design work, not a wording fix, and is left as the open item H9 already names it as.

## 3. Right format

*Is the content presented so a clinician can act on it quickly, not buried in text?*

**This is where the review found a real, previously unnoticed defect, and fixed it.**

Measured directly from the running service before this review (`curl` against `/cds-services/patient-view`, see git history for the exact numbers): the predicted-card `detail` field ran to **156 words / 997 characters in a single undifferentiated paragraph**, mixing the actionable clinical statement (what happened, when it will arrive, that it is unconfirmed) with dense transport-model methodology (the Taylor-dispersion approximation, the velocity-sensitivity band, the arrival-probability caveat, the WFD-classification disclaimer) with no visual separation. This is a textbook alert-fatigue and information-overload failure mode -- exactly what "right format" exists to catch -- in a card meant to be read in seconds at the point of care.

**Fix applied** (`src/cdsHooks/patientView.ts`): CDS Hooks 2.0 requires `detail` to be GFM Markdown, which this project had never used for anything beyond plain sentences. The card now splits into two paragraphs: a short primary statement (what happened / predicted arrival window / explicit "not a confirmed exposure" caution -- **43 words** on the predicted card, down from 156, measured after the fix), followed by a blank line and the full methodology, unchanged and undeleted, set in italics as a clearly secondary block. **No information was removed** -- the fix is purely structural, consistent with this project's disclosure policy, which requires every caveat to stay present, not to become harder to find. Locked in by a regression test (`test/cdsHooks.test.ts`, "card detail is split into a short primary statement and a separate caveat paragraph") so a future edit cannot silently re-merge the two.

The `order-select` card was checked too and did not have this problem (a single, ~55-word paragraph already) -- no change made there.

## 4. Right channel

*Is the alert delivered through the system the clinician is already using, not a side channel they have to go looking for?*

**Findings:** this is close to the strongest-served right in the whole design. The entire architecture exists to deliver the alert as a **native CDS Hooks card inside the EHR itself**, at the exact moment specified by the CDS Hooks 2.0 hook contract -- not an email, a pager message, or a separate dashboard the clinician has to remember to check. AHRQ's own framework names "a clinical information system (CIS) such as an electronic medical record (EMR)" as the textbook example of a right channel; that is precisely the channel used here.

**No changes made** -- this is correctly designed, not merely adequate.

## 5. Right time in workflow

*Does the alert appear at the moment a clinician can act on it, not before or after that moment is useful?*

**Findings:**
- `patient-view` fires at chart-open -- early in an encounter, appropriate for *awareness* before decisions are made.
- `order-select` fires only while a medication order is actively being drafted -- the point of *action*, appropriate for a stewardship nudge that should influence a decision already in progress rather than arrive after the order is signed.
- **A real, unaddressed gap found by this review:** nothing suppresses re-display of the same unconfirmed information on every subsequent chart-open within one encounter. A clinician who reopens the same patient's chart repeatedly during a long ED visit would see the identical card every time. The CDS Hooks feedback endpoint (`SAFETY_CASE.md` H1.4) records whether a card was *overridden*, but nothing today tracks "already seen this episode" to suppress a repeat. This is a real alert-fatigue risk distinct from H9, and is **not fixed here** -- it needs a real design decision (what counts as "the same alert" across encounters, how long a suppression should last) that a clinician, not a developer, should make.

## Summary

| Right | Verdict | Action taken |
|---|---|---|
| Information | Adequate | None needed |
| Person | Partial (order-select) | Not fixed -- tracked as `SAFETY_CASE.md` H9, confirmed independently here |
| Format | **Defect found and fixed** | Card `detail` restructured into primary statement + separated caveats, regression-tested |
| Channel | Strong | None needed |
| Time in workflow | Partial | Repeat-display suppression identified as a new, real, unaddressed gap |

This review found one concrete defect and fixed it, confirmed one previously-known gap independently, and surfaced one new gap that was not previously documented. It did not, and could not, replace an actual clinician looking at this design.
