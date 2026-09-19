import random

from app.core.fhir_compiler import LoincCodes, SnomedCodes, compile_bundle
from simulator.stream_generator import all_stations, breach_reading
from app.core.anomaly_engine import CciInputs, compute_bio_risk
from app.models.oah_indicators import IndicatorsOah


def _sample_indicators() -> IndicatorsOah:
    station = all_stations()[0]
    event = breach_reading(station, rng=random.Random(3))
    bio_risk = compute_bio_risk(
        CciInputs(
            fecal_coliforms_cfu_100ml=event.assay.fecal_coliforms_cfu_100ml,
            dissolved_oxygen_mg_l=event.sonde.dissolved_oxygen_mg_l,
            diatom_teratology_status=event.assay.diatom_teratology_status,
        )
    )
    return IndicatorsOah.from_telemetry(event, bio_risk)


def test_bundle_is_a_transaction_bundle_with_expected_entry_count() -> None:
    bundle = compile_bundle(_sample_indicators())
    assert bundle.resourceType == "Bundle"
    assert bundle.type == "transaction"
    # Location + 4 Observations (DO, coliforms, temperature, pH) + RiskAssessment + Flag
    assert len(bundle.entry) == 7


def test_every_entry_has_a_transaction_request() -> None:
    bundle = compile_bundle(_sample_indicators())
    for entry in bundle.entry:
        assert entry.request.method == "POST"
        assert entry.request.url  # non-empty


def test_fecal_coliform_observation_uses_the_corrected_loinc_code() -> None:
    bundle = compile_bundle(_sample_indicators())
    coliform_obs = next(
        e.resource
        for e in bundle.entry
        if e.resource.resourceType == "Observation" and "coliform" in (e.fullUrl or "")
    )
    coding = coliform_obs.code.coding[0]
    assert coding.system == "http://loinc.org"
    assert coding.code == LoincCodes.FECAL_COLIFORMS_WATER == "20769-6"
    # The spec's original (incorrect) code was 2160-0 (Creatinine) -- must never appear here.
    assert coding.code != "2160-0"


def test_ph_observation_uses_the_corrected_loinc_code() -> None:
    bundle = compile_bundle(_sample_indicators())
    ph_obs = next(
        e.resource for e in bundle.entry if e.resource.resourceType == "Observation" and "ph" in (e.fullUrl or "")
    )
    coding = ph_obs.code.coding[0]
    assert coding.code == LoincCodes.PH_WATER == "9481-3"
    # The spec's original (incorrect) code was 2708-6 (oxygen saturation) -- must never appear here.
    assert coding.code != "2708-6"


def test_risk_assessment_uses_the_corrected_leptospirosis_snomed_code() -> None:
    bundle = compile_bundle(_sample_indicators())
    risk = next(e.resource for e in bundle.entry if e.resource.resourceType == "RiskAssessment")
    coding = risk.prediction[0].outcome.coding[0]
    assert coding.system == "http://snomed.info/sct"
    assert coding.code == SnomedCodes.LEPTOSPIROSIS == "77377001"
    assert coding.code != "284530008"  # spec's incorrect original code


def test_flag_is_active_when_biohazard_flag_is_active() -> None:
    indicators = _sample_indicators()
    assert indicators.bio_risk.biohazard_flag_active is True
    bundle = compile_bundle(indicators)
    flag = next(e.resource for e in bundle.entry if e.resource.resourceType == "Flag")
    assert flag.status == "active"
