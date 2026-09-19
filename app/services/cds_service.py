"""CDS Hooks `patient-view` service: discovery manifest + hook evaluation.

Wires together the spatial engine (is this patient's address in a flagged
catchment, and which station is nearest to it?), the ingestion cache (what's
that station's latest bio-risk state?), the propagation engine (is an
upstream plume predicted to reach that station soon, even if it hasn't
tripped yet?), and the synthesizer (Gemini + deterministic fallback) into
the HL7 CDS Hooks card response shape.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from app.core.gemini_synthesizer import PatientClinicalContext, synthesize_card
from app.core.propagation_engine import PropagationForecast, StationPosition, compute_forecasts, nearest_station
from app.core.spatial_engine import CatchmentIndex, CatchmentMatch
from app.models.cds_hooks import (
    Card,
    CardSource,
    CdsHookRequest,
    CdsHookResponse,
    CdsServiceDescriptor,
    CdsDiscoveryResponse,
)
from app.services.ingest_service import catchment_state

logger = logging.getLogger(__name__)

GEOLOCATION_EXTENSION_URL = "http://hl7.org/fhir/StructureDefinition/geolocation"

_BETA_LACTAM_KEYWORDS = ("penicillin", "amoxicillin", "ampicillin", "cephalosporin", "beta-lactam", "betalactam")
_RENAL_IMPAIRMENT_KEYWORDS = ("chronic kidney disease", "renal impairment", "renal failure", "ckd", "kidney disease")


def discovery_manifest() -> CdsDiscoveryResponse:
    """The `GET /cds-services` discovery response."""
    return CdsDiscoveryResponse(
        services=[
            CdsServiceDescriptor(
                hook="patient-view",
                id="pathostream-biohazard-exposure",
                title="PathoStream-EHR: waterborne biohazard exposure check",
                description=(
                    "Flags patients whose home address falls within a river catchment "
                    "currently showing an active biohazard exposure signature (fecal "
                    "coliforms, dissolved oxygen, diatom teratology), surfacing an "
                    "empiric sepsis/leptospirosis workup suggestion during the Sepsis "
                    "Golden Hour."
                ),
                prefetch={
                    "patient": "Patient/{{context.patientId}}",
                    "allergies": "AllergyIntolerance?patient={{context.patientId}}",
                    "conditions": "Condition?patient={{context.patientId}}",
                },
            )
        ]
    )


@dataclass(frozen=True)
class PatientAddress:
    latitude: float
    longitude: float


def _extract_address(patient_resource: dict[str, Any]) -> PatientAddress | None:
    """Pull (lat, lon) off the first FHIR `Patient.address` that carries a
    `geolocation` extension (http://hl7.org/fhir/StructureDefinition/geolocation).

    Real EHRs vary widely in whether/how they geocode patient addresses;
    this only handles the standard FHIR extension shape. If it's absent,
    the caller should fail safe (treat the patient as "location unknown",
    not as "not at risk").
    """
    for address in patient_resource.get("address", []) or []:
        for extension in address.get("extension", []) or []:
            if extension.get("url") != GEOLOCATION_EXTENSION_URL:
                continue
            lat = lon = None
            for sub in extension.get("extension", []) or []:
                if sub.get("url") == "latitude":
                    lat = sub.get("valueDecimal")
                elif sub.get("url") == "longitude":
                    lon = sub.get("valueDecimal")
            if lat is not None and lon is not None:
                return PatientAddress(latitude=float(lat), longitude=float(lon))
    return None


def _concept_text_matches(codeable_concept: dict[str, Any], keywords: tuple[str, ...]) -> bool:
    haystacks = [codeable_concept.get("text", "")]
    for coding in codeable_concept.get("coding", []) or []:
        haystacks.append(coding.get("display", ""))
    haystack = " ".join(h for h in haystacks if h).lower()
    return any(keyword in haystack for keyword in keywords)


def _has_severe_beta_lactam_allergy(allergy_bundle: dict[str, Any]) -> bool:
    for entry in allergy_bundle.get("entry", []) or []:
        resource = entry.get("resource", {})
        if resource.get("resourceType") != "AllergyIntolerance":
            continue
        code = resource.get("code", {})
        if not _concept_text_matches(code, _BETA_LACTAM_KEYWORDS):
            continue
        for reaction in resource.get("reaction", []) or []:
            if reaction.get("severity") == "severe":
                return True
        # No explicit severity recorded: treat any recorded beta-lactam
        # allergy as significant enough to route to the alternative
        # regimen -- erring toward the safer branch when data is thin.
        if not resource.get("reaction"):
            return True
    return False


def _has_renal_impairment(condition_bundle: dict[str, Any]) -> bool:
    for entry in condition_bundle.get("entry", []) or []:
        resource = entry.get("resource", {})
        if resource.get("resourceType") != "Condition":
            continue
        if _concept_text_matches(resource.get("code", {}), _RENAL_IMPAIRMENT_KEYWORDS):
            return True
    return False


def _forecast_card(forecast: PropagationForecast, match: CatchmentMatch) -> Card:
    """A precautionary, non-critical card for a patient whose NEAREST
    station hasn't tripped, but who sits downstream of one that has --
    computed by `app.core.propagation_engine`, never by Gemini (this is a
    deterministic geometric/temporal projection, not a clinical judgment
    call, so there's nothing for an LLM to usefully phrase here)."""
    eta_desc = (
        f"~{round(forecast.eta_minutes)} min"
        if forecast.eta_minutes < 120
        else f"~{forecast.eta_minutes / 60:.1f} hr"
    )
    return Card(
        summary="Upstream waterborne contamination predicted to reach this address soon",
        indicator="warning",
        detail=(
            f"Station {forecast.source_station_id} in catchment '{match.catchment_name}' currently shows an "
            f"active biohazard exposure flag. A downstream-propagation model (illustrative -- "
            f"{forecast.distance_km} km at the configured assumed flow velocity, NOT a calibrated hydrological "
            f"forecast) predicts the contamination front may reach this patient's nearest monitoring point "
            f"({forecast.target_station_id}) in {eta_desc}, estimated probability {forecast.probability:.0%}. "
            "No local sensor confirmation yet -- this is a precautionary early-warning, not a confirmed "
            "exposure. Consider precautionary counseling; re-evaluate if the local station subsequently "
            "confirms an active flag."
        ),
        source=CardSource(label="PathoStream-EHR (downstream propagation forecast, deterministic)"),
        suggestions=[],
    )


def handle_patient_view(request: CdsHookRequest, catchment_index: CatchmentIndex) -> CdsHookResponse:
    """Evaluate the `patient-view` hook and return zero or more cards.

    Resolves the patient's NEAREST monitoring station within their matched
    catchment (not just "any flagged station in the same catchment", which
    would fire identically for a patient 50m from a breach and one 8km
    downstream at the far end of the corridor). Three outcomes:

    1. Nearest station itself flagged -> the existing critical CDS card via
       `synthesize_card` (Gemini-authored or deterministic fallback --
       never nothing).
    2. Nearest station not flagged, but an upstream station's plume is
       predicted to reach it soon (`propagation_engine.compute_forecasts`)
       -> a precautionary `warning`-level forecast card.
    3. Neither -> silent (no cards).

    Also silent when the patient's address can't be geocoded or doesn't
    fall inside any monitored catchment.
    """
    patient_resource = request.prefetch.get("patient", {})
    address = _extract_address(patient_resource)
    if address is None:
        logger.info("patient-view hookInstance=%s: no geocoded address in prefetch; silent.", request.hookInstance)
        return CdsHookResponse(cards=[])

    match = catchment_index.locate(address.latitude, address.longitude)
    if not match.matched or match.catchment_id is None:
        return CdsHookResponse(cards=[])

    catchment_readings = catchment_state.all_catchments().get(match.catchment_id, {})
    if not catchment_readings:
        return CdsHookResponse(cards=[])

    positions = {
        station_id: StationPosition(station_id=station_id, latitude=ind.latitude, longitude=ind.longitude)
        for station_id, ind in catchment_readings.items()
    }
    nearest_id = nearest_station(positions, address.latitude, address.longitude)
    nearest_indicators = catchment_readings.get(nearest_id) if nearest_id else None

    if nearest_indicators is not None and nearest_indicators.bio_risk.biohazard_flag_active:
        allergy_bundle = request.prefetch.get("allergies", {})
        condition_bundle = request.prefetch.get("conditions", {})
        patient_context = PatientClinicalContext(
            patient_id=request.context.patientId,
            has_severe_beta_lactam_allergy=_has_severe_beta_lactam_allergy(allergy_bundle),
            has_renal_impairment=_has_renal_impairment(condition_bundle),
        )
        card = synthesize_card(patient_context, match, nearest_indicators.bio_risk)
        return CdsHookResponse(cards=[card])

    flow_order = catchment_index.flow_order(match.catchment_id)
    if nearest_id and flow_order:
        flagged_ids = {sid for sid, ind in catchment_readings.items() if ind.bio_risk.biohazard_flag_active}
        forecast = next(
            (f for f in compute_forecasts(flow_order, positions, flagged_ids) if f.target_station_id == nearest_id),
            None,
        )
        if forecast is not None:
            return CdsHookResponse(cards=[_forecast_card(forecast, match)])

    return CdsHookResponse(cards=[])
