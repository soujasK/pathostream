"""Tests for app/core/propagation_engine.py -- the downstream contamination
-propagation forecasting engine (resilience/early-warning capability)."""

from app.config import Settings
from app.core.propagation_engine import StationPosition, compute_forecasts, nearest_station


def _positions() -> dict[str, StationPosition]:
    """Three points spaced a few hundred meters apart, roughly matching the
    demo catchment's scale."""
    return {
        "A": StationPosition("A", latitude=19.10, longitude=72.90),
        "B": StationPosition("B", latitude=19.09, longitude=72.89),
        "C": StationPosition("C", latitude=19.08, longitude=72.88),
    }


def test_compute_forecasts_only_predicts_downstream_targets() -> None:
    forecasts = compute_forecasts(["A", "B", "C"], _positions(), flagged_station_ids={"B"}, settings=Settings())

    assert {f.target_station_id for f in forecasts} == {"C"}
    assert forecasts[0].source_station_id == "B"


def test_compute_forecasts_never_predicts_upstream_of_the_flagged_station() -> None:
    """A is upstream of B; flagging B must never produce a forecast for A."""
    forecasts = compute_forecasts(["A", "B", "C"], _positions(), flagged_station_ids={"B"}, settings=Settings())

    assert "A" not in {f.target_station_id for f in forecasts}


def test_compute_forecasts_skips_already_flagged_targets() -> None:
    forecasts = compute_forecasts(["A", "B", "C"], _positions(), flagged_station_ids={"A", "B"}, settings=Settings())

    # B is downstream of A but already flagged itself -- nothing to predict there.
    assert {f.target_station_id for f in forecasts} == {"C"}


def test_compute_forecasts_prefers_the_soonest_arrival_when_multiple_sources() -> None:
    forecasts = compute_forecasts(["A", "B", "C"], _positions(), flagged_station_ids={"A", "B"}, settings=Settings())

    assert len(forecasts) == 1
    assert forecasts[0].target_station_id == "C"
    assert forecasts[0].source_station_id == "B"  # closer source wins over A


def test_compute_forecasts_respects_the_configured_horizon() -> None:
    settings = Settings(propagation_horizon_minutes=0.001)  # effectively zero horizon

    forecasts = compute_forecasts(["A", "B", "C"], _positions(), flagged_station_ids={"A"}, settings=settings)

    assert forecasts == []


def test_compute_forecasts_ignores_unflagged_sources() -> None:
    forecasts = compute_forecasts(["A", "B", "C"], _positions(), flagged_station_ids=set(), settings=Settings())

    assert forecasts == []


def test_nearest_station_picks_the_closest_point() -> None:
    assert nearest_station(_positions(), latitude=19.081, longitude=72.881) == "C"


def test_nearest_station_returns_none_for_empty_positions() -> None:
    assert nearest_station({}, latitude=19.0, longitude=72.0) is None
