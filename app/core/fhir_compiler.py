"""Compiles an `IndicatorsOah` record into a FHIR R4 transaction Bundle.

TERMINOLOGY CODE CORRECTIONS (read this before trusting any code below)
-------------------------------------------------------------------------
The original engineering spec asserted several LOINC/SNOMED codes that we
verified against public terminology-browser sources (LOINC.org / FindACode
mirrors, HL7 FHIR value-set publications) and found to be **incorrect**:

  * Fecal coliforms: spec said LOINC `2160-0`. That code is actually
    "Creatinine [Mass/volume] in Serum or Plasma" -- a routine kidney-
    function lab test, completely unrelated to water microbiology. LOINC
    does not have a dedicated "fecal coliform" component; the closest real,
    verified code for a quantitative coliform count in water is
    `20769-6` ("Coliform bacteria [#/volume] in Water by Viability count"),
    used below.
  * pH: spec said LOINC `2708-6`. That code is actually an arterial blood
    "Oxygen saturation" vital-sign code (used in HL7's own oxygen-sat FHIR
    profile). The correct, verified code for pH of water is `9481-3`
    ("pH of Water"), used below.
  * Septic shock: spec said SNOMED CT `240369006`. The correct, verified
    concept is `76571007` ("Septic shock (disorder)"), used below.
  * Leptospirosis: spec said SNOMED CT `284530008`. The correct, verified
    concept is `77377001` ("Leptospirosis (disorder)"), used below.
  * Sepsis (`91302008`) and the UCUM units quoted in the spec (`mg/L`,
    `Cel`, `[pH]`) were verified correct as given.
  * We could not independently verify a specific, dedicated LOINC code for
    "Dissolved Oxygen in Water" or "Temperature of Water" via public
    sources in the time available. Rather than guess, `LoincCodes` below
    marks these as `UNVERIFIED_...` placeholders with a loud comment --
    confirm the real codes against a live LOINC terminology server
    (fhir.loinc.org, requires a free account) before using this compiler
    against a real FHIR server.

This matters because the spec's own stated requirement #1 is "NO FAKE OR
MOCK MEDICAL CODE" -- shipping the spec's original codes verbatim would
have violated that requirement.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.config import get_settings
from app.core.propagation_engine import PropagationForecast
from app.models.fhir_resources import (
    BundleEntry,
    BundleRequest,
    BundleResource,
    CodeableConcept,
    Coding,
    FlagResource,
    LocationPosition,
    LocationResource,
    Meta,
    ObservationResource,
    Period,
    Quantity,
    Reference,
    RiskAssessmentPrediction,
    RiskAssessmentResource,
)
from app.models.oah_indicators import IndicatorsOah


class LoincCodes:
    DISSOLVED_OXYGEN_WATER = "UNVERIFIED_DISSOLVED_OXYGEN_WATER"  # see module docstring
    FECAL_COLIFORMS_WATER = "20769-6"  # Coliform bacteria [#/volume] in Water by Viability count (verified)
    WATER_TEMPERATURE = "UNVERIFIED_WATER_TEMPERATURE"  # see module docstring
    PH_WATER = "9481-3"  # pH of Water (verified)


class SnomedCodes:
    SEPSIS = "91302008"  # Sepsis (disorder) (verified)
    SEPTIC_SHOCK = "76571007"  # Septic shock (disorder) (verified; corrects spec's 240369006)
    LEPTOSPIROSIS = "77377001"  # Leptospirosis (disorder) (verified; corrects spec's 284530008)
    BIOHAZARD_EXPOSURE_FLAG = "biohazard-exposure"  # local/demo code, not a published SNOMED concept


LOINC_SYSTEM = "http://loinc.org"
SNOMED_SYSTEM = "http://snomed.info/sct"
UCUM_SYSTEM = "http://unitsofmeasure.org"
OAH_PROFILE_URL = "http://hl7.eu/fhir/ig/oah/StructureDefinition/observation-indicators-oah"


def _iso(indicators: IndicatorsOah) -> str:
    return indicators.observed_at.isoformat()


def _dissolved_oxygen_observation(indicators: IndicatorsOah, location_ref: Reference) -> ObservationResource:
    coding = Coding(
        system=LOINC_SYSTEM,
        code=LoincCodes.DISSOLVED_OXYGEN_WATER,
        display="Dissolved oxygen in Water",
    )
    return ObservationResource(
        id=f"obs-do-{indicators.station_id}",
        meta=Meta(profile=[OAH_PROFILE_URL]),
        code=CodeableConcept(coding=[coding], text="Optical dissolved oxygen (YSI EXO2 sonde)"),
        focus=[location_ref],
        effectiveDateTime=_iso(indicators),
        valueQuantity=Quantity(value=indicators.water.dissolved_oxygen_mg_l, unit="mg/L", code="mg/L"),
    )


def _fecal_coliform_observation(indicators: IndicatorsOah, location_ref: Reference) -> ObservationResource:
    coding = Coding(
        system=LOINC_SYSTEM,
        code=LoincCodes.FECAL_COLIFORMS_WATER,
        display="Coliform bacteria [#/volume] in Water",
    )
    quantity = Quantity(
        value=indicators.biological.fecal_indicator_bacteria_cfu_100ml,
        unit="CFU/100mL",
        code="{CFU}/(100.mL)",
    )
    return ObservationResource(
        id=f"obs-coliform-{indicators.station_id}",
        meta=Meta(profile=[OAH_PROFILE_URL]),
        code=CodeableConcept(coding=[coding], text="Fecal-indicator coliform count (Colilert/Aquagenx field assay)"),
        focus=[location_ref],
        effectiveDateTime=_iso(indicators),
        valueQuantity=quantity,
    )


def _water_temperature_observation(indicators: IndicatorsOah, location_ref: Reference) -> ObservationResource:
    coding = Coding(system=LOINC_SYSTEM, code=LoincCodes.WATER_TEMPERATURE, display="Temperature of Water")
    return ObservationResource(
        id=f"obs-temp-{indicators.station_id}",
        meta=Meta(profile=[OAH_PROFILE_URL]),
        code=CodeableConcept(coding=[coding], text="Water temperature (YSI EXO2 sonde)"),
        focus=[location_ref],
        effectiveDateTime=_iso(indicators),
        valueQuantity=Quantity(value=indicators.water.temperature_c, unit="Cel", code="Cel"),
    )


def _ph_observation(indicators: IndicatorsOah, location_ref: Reference) -> ObservationResource:
    coding = Coding(system=LOINC_SYSTEM, code=LoincCodes.PH_WATER, display="pH of Water")
    return ObservationResource(
        id=f"obs-ph-{indicators.station_id}",
        meta=Meta(profile=[OAH_PROFILE_URL]),
        code=CodeableConcept(coding=[coding], text="pH (YSI EXO2 sonde)"),
        focus=[location_ref],
        effectiveDateTime=_iso(indicators),
        valueQuantity=Quantity(value=indicators.water.ph, unit="pH", code="[pH]"),
    )


def _location_resource(indicators: IndicatorsOah) -> LocationResource:
    return LocationResource(
        id=f"loc-{indicators.catchment_id}-{indicators.station_id}",
        name=f"{indicators.catchment_id} / station {indicators.station_id}",
        description="Water quality monitoring station within the catchment boundary.",
        position=LocationPosition(longitude=indicators.longitude, latitude=indicators.latitude),
    )


_RISK_PROBABILITY_SYSTEM = "http://terminology.hl7.org/CodeSystem/risk-probability"
_FLAG_CATEGORY_SYSTEM = "http://terminology.hl7.org/CodeSystem/flag-category"
_LOCAL_FLAG_SYSTEM = "http://example.org/pathostream-ehr/flags"


def _risk_assessment_resource(indicators: IndicatorsOah, location_ref: Reference) -> RiskAssessmentResource:
    qualitative = "high" if indicators.bio_risk.biohazard_flag_active else "low"
    outcome_coding = Coding(
        system=SNOMED_SYSTEM,
        code=SnomedCodes.LEPTOSPIROSIS,
        display="Leptospirosis (disorder)",
    )
    outcome = CodeableConcept(
        coding=[outcome_coding],
        text="Waterborne enteric/leptospiral illness risk to persons exposed to this catchment",
    )
    qualitative_risk = CodeableConcept(coding=[Coding(system=_RISK_PROBABILITY_SYSTEM, code=qualitative)])
    return RiskAssessmentResource(
        id=f"risk-{indicators.station_id}",
        subject=location_ref,
        occurrenceDateTime=_iso(indicators),
        basis=[location_ref],
        prediction=[
            RiskAssessmentPrediction(
                outcome=outcome,
                qualitativeRisk=qualitative_risk,
                rationale=indicators.bio_risk.rationale,
            )
        ],
    )


def _flag_resource(indicators: IndicatorsOah, location_ref: Reference) -> FlagResource:
    category_coding = Coding(system=_FLAG_CATEGORY_SYSTEM, code="safety")
    flag_coding = Coding(
        system=_LOCAL_FLAG_SYSTEM,
        code=SnomedCodes.BIOHAZARD_EXPOSURE_FLAG,
        display="Biohazard exposure risk",
    )
    return FlagResource(
        id=f"flag-{indicators.station_id}",
        status="active" if indicators.bio_risk.biohazard_flag_active else "inactive",
        category=[CodeableConcept(coding=[category_coding])],
        code=CodeableConcept(coding=[flag_coding], text=indicators.bio_risk.rationale),
        subject=location_ref,
    )


def compile_bundle(indicators: IndicatorsOah) -> BundleResource:
    """Compile one `IndicatorsOah` record into a FHIR R4 transaction Bundle.

    Produces, in order: Observation(DO), Observation(fecal coliforms),
    Observation(temperature), Observation(pH), Location, RiskAssessment,
    Flag -- matching the five resource types the spec's FHIR R4 Bundle
    Compiler section calls out (the four Observations count as one
    numbered item there; we emit all four analytes rather than only the
    two the spec explicitly named, since IndicatorsOah.water carries all
    four).
    """
    location = _location_resource(indicators)
    location_ref = Reference(reference=f"Location/{location.id}", display=location.name)

    entries = [
        BundleEntry(
            fullUrl=f"urn:uuid:{location.id}",
            resource=location,
            request=BundleRequest(method="POST", url="Location"),
        ),
        BundleEntry(
            fullUrl=f"urn:uuid:obs-do-{indicators.station_id}",
            resource=_dissolved_oxygen_observation(indicators, location_ref),
            request=BundleRequest(method="POST", url="Observation"),
        ),
        BundleEntry(
            fullUrl=f"urn:uuid:obs-coliform-{indicators.station_id}",
            resource=_fecal_coliform_observation(indicators, location_ref),
            request=BundleRequest(method="POST", url="Observation"),
        ),
        BundleEntry(
            fullUrl=f"urn:uuid:obs-temp-{indicators.station_id}",
            resource=_water_temperature_observation(indicators, location_ref),
            request=BundleRequest(method="POST", url="Observation"),
        ),
        BundleEntry(
            fullUrl=f"urn:uuid:obs-ph-{indicators.station_id}",
            resource=_ph_observation(indicators, location_ref),
            request=BundleRequest(method="POST", url="Observation"),
        ),
        BundleEntry(
            fullUrl=f"urn:uuid:risk-{indicators.station_id}",
            resource=_risk_assessment_resource(indicators, location_ref),
            request=BundleRequest(method="POST", url="RiskAssessment"),
        ),
        BundleEntry(
            fullUrl=f"urn:uuid:flag-{indicators.station_id}",
            resource=_flag_resource(indicators, location_ref),
            request=BundleRequest(method="POST", url="Flag"),
        ),
    ]
    return BundleResource(entry=entries)


def _qualitative_from_probability(probability: float) -> str:
    """Map a 0-1 probability onto HL7's risk-probability CodeSystem
    (negligible | low | moderate | high | certain) -- we only ever emit the
    three most relevant here."""
    if probability >= 0.7:
        return "high"
    if probability >= 0.4:
        return "moderate"
    return "low"


def _forecast_risk_assessment(
    catchment_id: str, forecast: PropagationForecast, now: datetime
) -> RiskAssessmentResource:
    """One *predicted* (not yet confirmed) downstream risk, using
    RiskAssessment.prediction's real `probabilityDecimal` / `whenPeriod`
    elements -- FHIR R4 has first-class support for exactly this kind of
    forward-looking risk statement; it's just rarely used correctly.
    """
    target_ref = Reference(
        reference=f"Location/loc-{catchment_id}-{forecast.target_station_id}",
        display=f"{catchment_id} / station {forecast.target_station_id}",
    )
    source_ref = Reference(
        reference=f"Location/loc-{catchment_id}-{forecast.source_station_id}",
        display=f"{catchment_id} / station {forecast.source_station_id}",
    )
    outcome = CodeableConcept(
        coding=[
            Coding(system=SNOMED_SYSTEM, code=SnomedCodes.LEPTOSPIROSIS, display="Leptospirosis (disorder)"),
        ],
        text=(
            f"Predicted waterborne biohazard arrival at station {forecast.target_station_id}, propagated "
            f"downstream from currently-flagged station {forecast.source_station_id} "
            f"({forecast.distance_km} km along the declared flow order)."
        ),
    )
    eta = now + timedelta(minutes=forecast.eta_minutes)
    velocity = get_settings().propagation_flow_velocity_m_s
    return RiskAssessmentResource(
        id=f"forecast-risk-{forecast.source_station_id}-{forecast.target_station_id}",
        status="preliminary",
        subject=target_ref,
        occurrenceDateTime=now.isoformat(),
        basis=[source_ref],
        prediction=[
            RiskAssessmentPrediction(
                outcome=outcome,
                qualitativeRisk=CodeableConcept(
                    coding=[
                        Coding(
                            system=_RISK_PROBABILITY_SYSTEM,
                            code=_qualitative_from_probability(forecast.probability),
                        )
                    ]
                ),
                probabilityDecimal=forecast.probability,
                whenPeriod=Period(start=now.isoformat(), end=eta.isoformat()),
                rationale=(
                    f"Illustrative downstream-propagation model: {forecast.distance_km} km from currently-flagged "
                    f"station {forecast.source_station_id} at an assumed {velocity} m/s surface-flow velocity -- "
                    "NOT a calibrated hydrological forecast; see app/core/propagation_engine.py."
                ),
            )
        ],
    )


def compile_forecast_bundle(catchment_id: str, forecasts: list[PropagationForecast]) -> BundleResource:
    """Compile downstream contamination-propagation forecasts into a FHIR R4
    transaction Bundle of `preliminary`-status RiskAssessment resources --
    each one a *predicted* future risk, not a confirmed current one.
    """
    now = datetime.now(timezone.utc)
    entries = [
        BundleEntry(
            fullUrl=f"urn:uuid:forecast-risk-{forecast.source_station_id}-{forecast.target_station_id}",
            resource=_forecast_risk_assessment(catchment_id, forecast, now),
            request=BundleRequest(method="POST", url="RiskAssessment"),
        )
        for forecast in forecasts
    ]
    return BundleResource(entry=entries)
