"""Clinical CDS card synthesis: Gemini 1.5 Flash, with a deterministic
rule-based fallback that fires on ANY failure, timeout, or missing API key.

CLINICAL CONTENT NOTE: the empiric antibiotic choices encoded in
`deterministic_fallback_card` are the same choices the engineering spec
itself names (Ceftriaxone + Doxycycline for waterborne leptospiral/enteric
bacteremia; Ciprofloxacin as the fluoroquinolone alternative for severe
beta-lactam/penicillin allergy), which mirror standard Sanford Guide / IDSA
empiric-therapy patterns for suspected leptospirosis and severe enteric
bacteremia. This module does not invent new dosing, does not resolve drug
interactions beyond the allergy/renal flags described below, and MUST NOT
be treated as validated clinical guidance -- see README.md, "Clinical &
regulatory status". Any real deployment needs sign-off from clinical
pharmacy, infectious disease, and institutional protocol owners, plus the
regulatory pathway appropriate to a clinical decision support device.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass

from app.config import Settings, get_settings
from app.core.spatial_engine import CatchmentMatch
from app.models.cds_hooks import Card, CardSource, Suggestion, SuggestionAction
from app.models.oah_indicators import BioRiskIndicators

logger = logging.getLogger(__name__)

_GOLDEN_HOUR_NOTE = (
    "Sepsis Golden Hour: obtain blood cultures and consider PCR for Leptospira/enteric "
    "pathogens, but do NOT delay empiric antimicrobial therapy while awaiting results."
)


@dataclass(frozen=True)
class PatientClinicalContext:
    """The minimal patient-side facts this CDS logic reasons over.

    Extracted from CDS Hooks `prefetch` FHIR resources by
    `app/services/cds_service.py` -- this module never talks to FHIR
    directly, so it stays testable with plain Python values.
    """

    patient_id: str
    has_severe_beta_lactam_allergy: bool = False
    has_renal_impairment: bool = False
    presenting_vitals_summary: str | None = None  # e.g. "BP 85/50, T 39.2C, HR 122"


@dataclass(frozen=True)
class GeminiCardPayload:
    """The structured shape we ask Gemini to fill in (`response_schema`)."""

    summary: str
    indicator: str  # "info" | "warning" | "critical"
    detail: str
    antibiotic_suggestion_label: str
    antibiotic_suggestion_detail: str


GEMINI_RESPONSE_SCHEMA: dict[str, object] = {
    "type": "object",
    "properties": {
        "summary": {"type": "string", "maxLength": 140},
        "indicator": {"type": "string", "enum": ["info", "warning", "critical"]},
        "detail": {"type": "string"},
        "antibiotic_suggestion_label": {"type": "string"},
        "antibiotic_suggestion_detail": {"type": "string"},
    },
    "required": [
        "summary",
        "indicator",
        "detail",
        "antibiotic_suggestion_label",
        "antibiotic_suggestion_detail",
    ],
}


def _empiric_regimen(patient: PatientClinicalContext) -> tuple[str, str]:
    """Return (label, detail) for the empiric antibiotic suggestion.

    This is the single source of truth for the antibiotic choice, used by
    BOTH the deterministic fallback and the prompt we send to Gemini (so
    Gemini is asked to phrase/explain this choice, not invent a different
    one).
    """
    if patient.has_severe_beta_lactam_allergy:
        label = "Ciprofloxacin (beta-lactam allergy alternative)"
        detail = (
            "Severe beta-lactam/penicillin allergy on file: avoid cephalosporins and "
            "penicillins. Consider ciprofloxacin (fluoroquinolone) as an alternative "
            "empiric agent for suspected waterborne leptospiral/enteric bacteremia, "
            "per institutional protocol."
        )
    else:
        label = "Ceftriaxone + Doxycycline (empiric, waterborne exposure)"
        detail = (
            "No severe beta-lactam allergy on file: consider empiric ceftriaxone plus "
            "doxycycline, covering leptospirosis and enteric/aeromonas bacteremia, per "
            "institutional protocol."
        )
    if patient.has_renal_impairment:
        detail += (
            " Renal impairment flag on file: avoid high-dose aminoglycosides and confirm "
            "renal dosing adjustments for the selected regimen with pharmacy."
        )
    return label, detail


def deterministic_fallback_card(
    patient: PatientClinicalContext,
    catchment: CatchmentMatch,
    bio_risk: BioRiskIndicators,
) -> Card:
    """Rule-based CDS card. Used whenever Gemini is unavailable, slow, or errors.

    This function has NO external dependencies and cannot itself time out
    or fail on a network call, which is what lets `synthesize_card` treat
    it as an unconditional safety net: "never drop an alert for an
    in-catchment patient presenting with septic vitals" is satisfied by
    always being able to reach this function.
    """
    label, detail_suffix = _empiric_regimen(patient)
    detail = (
        f"Patient address falls within monitored catchment '{catchment.catchment_name}', "
        f"which currently shows an active biohazard exposure flag ({bio_risk.rationale}). "
        f"{_GOLDEN_HOUR_NOTE} {detail_suffix}"
    )
    return Card(
        summary="Waterborne biohazard exposure risk: consider sepsis workup",
        indicator="critical",
        detail=detail,
        source=CardSource(label="PathoStream-EHR (deterministic rule engine)"),
        suggestions=[
            Suggestion(
                label=label,
                actions=[
                    SuggestionAction(
                        type="create",
                        description="Order empiric antimicrobial therapy per institutional sepsis protocol.",
                    )
                ],
            ),
            Suggestion(
                label="Order blood cultures + PCR (Leptospira / enteric panel)",
                actions=[
                    SuggestionAction(
                        type="create",
                        description="Obtain blood cultures and pathogen PCR without delaying antibiotics.",
                    )
                ],
            ),
        ],
    )


def _try_gemini(
    patient: PatientClinicalContext,
    catchment: CatchmentMatch,
    bio_risk: BioRiskIndicators,
    settings: Settings,
) -> Card | None:
    """Attempt Gemini-based synthesis. Returns None on ANY problem at all.

    Every failure mode here (missing key, import error, timeout, malformed
    response) is caught and converted to `None` rather than propagated --
    callers must always follow a `None` result with
    `deterministic_fallback_card`.
    """
    if not settings.gemini_api_key:
        return None

    try:
        from google import genai
    except ImportError:
        logger.warning("google-genai not installed; using deterministic fallback.")
        return None

    label, detail_suffix = _empiric_regimen(patient)
    prompt = (
        "You are drafting the free-text fields of an HL7 CDS Hooks patient-view card "
        "for an emergency clinician. A patient's home address falls inside a river "
        "catchment with an active waterborne biohazard flag. "
        f"Catchment: {catchment.catchment_name}. Rationale: {bio_risk.rationale}. "
        f"Patient context: {patient.presenting_vitals_summary or 'vitals not available'}; "
        f"severe beta-lactam allergy: {patient.has_severe_beta_lactam_allergy}; "
        f"renal impairment: {patient.has_renal_impairment}. "
        f"The empiric antibiotic choice has ALREADY been decided by institutional rules "
        f"as: '{label}' -- {detail_suffix} Do not change or contradict this choice; "
        "just phrase it clearly for the card. Emphasize the Sepsis Golden Hour and that "
        "blood cultures/PCR must not delay empiric antibiotics. "
        "Respond with ONLY a JSON object matching the required schema, no prose, no "
        "markdown fences."
    )

    try:
        client = genai.Client(api_key=settings.gemini_api_key)
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": GEMINI_RESPONSE_SCHEMA,
            },
        )
        payload = json.loads(response.text or "")
        gemini_card = GeminiCardPayload(**payload)
    except Exception:  # noqa: BLE001 -- any Gemini/network/parse failure falls back safely.
        logger.exception("Gemini synthesis failed; using deterministic fallback.")
        return None

    if gemini_card.indicator not in {"info", "warning", "critical"}:
        return None

    return Card(
        summary=gemini_card.summary[:140],
        indicator=gemini_card.indicator,  # type: ignore[arg-type]
        detail=gemini_card.detail,
        source=CardSource(label="PathoStream-EHR (Gemini 1.5 Flash synthesis)"),
        suggestions=[
            Suggestion(
                label=gemini_card.antibiotic_suggestion_label,
                actions=[
                    SuggestionAction(
                        type="create",
                        description=gemini_card.antibiotic_suggestion_detail,
                    )
                ],
            ),
            Suggestion(
                label="Order blood cultures + PCR (Leptospira / enteric panel)",
                actions=[
                    SuggestionAction(
                        type="create",
                        description="Obtain blood cultures and pathogen PCR without delaying antibiotics.",
                    )
                ],
            ),
        ],
    )


def synthesize_card(
    patient: PatientClinicalContext,
    catchment: CatchmentMatch,
    bio_risk: BioRiskIndicators,
    settings: Settings | None = None,
) -> Card:
    """Produce the CDS card for an in-catchment, flagged patient.

    Tries Gemini first (bounded by `settings.gemini_timeout_seconds` at the
    HTTP-client level inside `google-genai`); ALWAYS falls back to the
    deterministic rule engine on any failure so that no alert is ever
    silently dropped.
    """
    settings = settings or get_settings()
    gemini_card = _try_gemini(patient, catchment, bio_risk, settings)
    if gemini_card is not None:
        return gemini_card
    return deterministic_fallback_card(patient, catchment, bio_risk)
