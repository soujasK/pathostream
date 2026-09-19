import random

import pytest
from pydantic import ValidationError

from app.models.telemetry import ColilertAquagenxReading, DiatomTeratologyStatus, TelemetryEvent, YsiExo2Reading
from app.services.ingest_service import catchment_state, ingest_event
from simulator.stream_generator import all_stations, breach_reading, normal_reading


@pytest.fixture(autouse=True)
def _clear_cache():
    """Each test gets a clean catchment_state cache (it's a module-level singleton)."""
    yield
    catchment_state._state.clear()  # noqa: SLF001 -- test-only reach into internals


def test_normal_reading_does_not_trigger_biohazard_flag() -> None:
    rng = random.Random(42)
    station = all_stations()[0]
    event = normal_reading(station, rng=rng)

    result = ingest_event(event)

    assert result.indicators.bio_risk.biohazard_flag_active is False
    assert catchment_state.get(event.catchment_id) is result.indicators


def test_breach_reading_triggers_biohazard_flag() -> None:
    rng = random.Random(7)
    station = all_stations()[0]
    event = breach_reading(station, rng=rng)

    result = ingest_event(event)

    assert result.indicators.bio_risk.biohazard_flag_active is True
    assert result.indicators.bio_risk.catchment_contamination_index > 25.0


def test_ingest_caches_latest_reading_per_catchment() -> None:
    rng = random.Random(1)
    station = all_stations()[0]

    first = ingest_event(normal_reading(station, rng=rng))
    second = ingest_event(breach_reading(station, rng=rng))

    cached = catchment_state.get(station.station_id and "mithi-river-mumbai")
    assert cached is second.indicators
    assert cached is not first.indicators


def test_negative_dissolved_oxygen_is_rejected() -> None:
    with pytest.raises(ValidationError):
        YsiExo2Reading(
            station_id="STN-TEST",
            dissolved_oxygen_mg_l=-1.0,
            temperature_c=25.0,
            turbidity_ntu=10.0,
            ph=7.0,
        )


def test_out_of_range_ph_is_rejected() -> None:
    with pytest.raises(ValidationError):
        YsiExo2Reading(
            station_id="STN-TEST",
            dissolved_oxygen_mg_l=6.0,
            temperature_c=25.0,
            turbidity_ntu=10.0,
            ph=15.0,
        )


def test_telemetry_event_requires_both_sub_readings() -> None:
    sonde = YsiExo2Reading(
        station_id="STN-TEST", dissolved_oxygen_mg_l=6.0, temperature_c=25.0, turbidity_ntu=10.0, ph=7.0
    )
    assay = ColilertAquagenxReading(
        station_id="STN-TEST",
        fecal_coliforms_cfu_100ml=100.0,
        diatom_teratology_status=DiatomTeratologyStatus.HEALTHY,
        vector_diptera_larval_density=0.5,
    )
    event = TelemetryEvent(
        catchment_id="mithi-river-mumbai", sonde=sonde, assay=assay, latitude=19.07, longitude=72.87
    )
    assert event.sonde.station_id == "STN-TEST"
    assert event.assay.diatom_teratology_status == DiatomTeratologyStatus.HEALTHY
