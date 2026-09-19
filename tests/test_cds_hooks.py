import time

import pytest

from app.core.spatial_engine import CatchmentIndex
from app.models.cds_hooks import CdsHookRequest, PatientViewContext
from app.services import cds_service
from app.services.ingest_service import catchment_state, ingest_event
from simulator.stream_generator import all_stations, breach_reading, demo_patient_geolocation_extension, normal_reading


@pytest.fixture(autouse=True)
def _clear_cache():
    yield
    catchment_state._state.clear()  # noqa: SLF001


@pytest.fixture()
def catchment_index() -> CatchmentIndex:
    return CatchmentIndex()


def _prefetch_for(
    latitude: float,
    longitude: float,
    *,
    beta_lactam_allergy: bool = False,
    renal_impairment: bool = False,
) -> dict:
    patient = {
        "resourceType": "Patient",
        "id": "demo-patient",
        "address": [{"extension": [demo_patient_geolocation_extension(latitude, longitude)]}],
    }
    allergies = {"resourceType": "Bundle", "entry": []}
    if beta_lactam_allergy:
        allergies["entry"].append(
            {
                "resource": {
                    "resourceType": "AllergyIntolerance",
                    "code": {"text": "Penicillin"},
                    "reaction": [{"severity": "severe"}],
                }
            }
        )
    conditions = {"resourceType": "Bundle", "entry": []}
    if renal_impairment:
        conditions["entry"].append(
            {"resource": {"resourceType": "Condition", "code": {"text": "Chronic kidney disease"}}}
        )
    return {"patient": patient, "allergies": allergies, "conditions": conditions}


def _hook_request(prefetch: dict) -> CdsHookRequest:
    return CdsHookRequest(
        hookInstance="test-instance-1",
        hook="patient-view",
        context=PatientViewContext(userId="Practitioner/demo-md", patientId="demo-patient"),
        prefetch=prefetch,
    )


def test_discovery_manifest_advertises_patient_view() -> None:
    manifest = cds_service.discovery_manifest()
    assert manifest.services[0].hook == "patient-view"
    assert manifest.services[0].id == "pathostream-biohazard-exposure"


def test_silent_card_when_no_active_biohazard_in_catchment(catchment_index: CatchmentIndex) -> None:
    station = all_stations()[0]
    ingest_event(normal_reading(station))  # healthy baseline, no flag

    request = _hook_request(_prefetch_for(station.latitude, station.longitude))
    response = cds_service.handle_patient_view(request, catchment_index)

    assert response.cards == []


def test_critical_card_fires_for_in_catchment_active_biohazard(catchment_index: CatchmentIndex) -> None:
    station = all_stations()[0]
    ingest_event(breach_reading(station))

    request = _hook_request(_prefetch_for(station.latitude, station.longitude))
    response = cds_service.handle_patient_view(request, catchment_index)

    assert len(response.cards) == 1
    assert response.cards[0].indicator == "critical"
    assert response.cards[0].suggestions  # at least one suggested order


def test_beta_lactam_allergy_routes_to_fluoroquinolone_suggestion(catchment_index: CatchmentIndex) -> None:
    station = all_stations()[0]
    ingest_event(breach_reading(station))

    request = _hook_request(_prefetch_for(station.latitude, station.longitude, beta_lactam_allergy=True))
    response = cds_service.handle_patient_view(request, catchment_index)

    label = response.cards[0].suggestions[0].label.lower()
    assert "ciprofloxacin" in label
    assert "ceftriaxone" not in label


def test_silent_card_for_patient_outside_any_catchment(catchment_index: CatchmentIndex) -> None:
    station = all_stations()[0]
    ingest_event(breach_reading(station))

    request = _hook_request(_prefetch_for(latitude=28.6139, longitude=77.2090))  # Delhi
    response = cds_service.handle_patient_view(request, catchment_index)

    assert response.cards == []


def test_forecast_warning_card_for_downstream_station_not_yet_flagged(catchment_index: CatchmentIndex) -> None:
    """STN-POWAI breaches; STN-SAKINAKA (immediately downstream, within the
    default forecast horizon) hasn't tripped locally yet -- its patients
    should still get a precautionary warning card, not silence."""
    stations = {s.station_id: s for s in all_stations()}
    ingest_event(breach_reading(stations["STN-POWAI"]))
    ingest_event(normal_reading(stations["STN-SAKINAKA"]))

    downstream = stations["STN-SAKINAKA"]
    request = _hook_request(_prefetch_for(downstream.latitude, downstream.longitude))
    response = cds_service.handle_patient_view(request, catchment_index)

    assert len(response.cards) == 1
    card = response.cards[0]
    assert card.indicator == "warning"
    assert "STN-POWAI" in card.detail
    assert not card.suggestions  # precautionary only -- no treatment suggestion yet


def test_silent_when_downstream_station_is_beyond_the_forecast_horizon(catchment_index: CatchmentIndex) -> None:
    """STN-KURLA is far enough downstream of STN-POWAI that, at the default
    assumed flow velocity, its predicted ETA exceeds the forecast horizon --
    no pre-alert should fire."""
    stations = {s.station_id: s for s in all_stations()}
    ingest_event(breach_reading(stations["STN-POWAI"]))
    ingest_event(normal_reading(stations["STN-KURLA"]))

    downstream = stations["STN-KURLA"]
    request = _hook_request(_prefetch_for(downstream.latitude, downstream.longitude))
    response = cds_service.handle_patient_view(request, catchment_index)

    assert response.cards == []


def test_no_forecast_card_for_a_station_upstream_of_the_flagged_one(catchment_index: CatchmentIndex) -> None:
    """Propagation only flows downstream -- STN-POWAI sits upstream of a
    flagged STN-SAKINAKA and must not receive a pre-alert."""
    stations = {s.station_id: s for s in all_stations()}
    ingest_event(normal_reading(stations["STN-POWAI"]))
    ingest_event(breach_reading(stations["STN-SAKINAKA"]))

    upstream = stations["STN-POWAI"]
    request = _hook_request(_prefetch_for(upstream.latitude, upstream.longitude))
    response = cds_service.handle_patient_view(request, catchment_index)

    assert response.cards == []


def test_patient_view_latency_is_under_300ms(catchment_index: CatchmentIndex) -> None:
    """No GEMINI_API_KEY is configured in the test environment, so this
    exercises the deterministic fallback path end-to-end (spatial lookup +
    rule-based synthesis), which is the latency-critical path in a real
    Sepsis Golden Hour scenario -- Gemini calls are explicitly NOT on the
    critical path for alert delivery.
    """
    station = all_stations()[0]
    ingest_event(breach_reading(station))
    request = _hook_request(_prefetch_for(station.latitude, station.longitude))

    start = time.perf_counter()
    response = cds_service.handle_patient_view(request, catchment_index)
    elapsed_ms = (time.perf_counter() - start) * 1000

    assert len(response.cards) == 1
    assert elapsed_ms < 300, f"patient-view took {elapsed_ms:.1f}ms, budget is 300ms"
