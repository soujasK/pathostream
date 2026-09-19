"""Downstream contamination-propagation forecasting.

Resilience-informatics capability: rather than only reacting once a station
crosses the biohazard threshold, this module answers "given a currently
-flagged upstream station, when is contamination predicted to physically
reach each downstream station?" -- an early-warning signal computed from
the river's known flow direction, not just a reactive per-point threshold.

This is an explicitly simplified, illustrative propagation model: a single
assumed uniform surface-flow velocity applied to straight-line inter-station
distance along the catchment's declared `station_flow_order` (see
`app/data/mithi_catchment.geojson`). It is NOT a calibrated hydrological/
hydraulic routing model -- a real deployment would replace
`Settings.propagation_flow_velocity_m_s` with real discharge/velocity gauge
data and proper channel routing. Consistent with this project's policy of
loud, documented placeholders rather than silent guesses (see README.md).
"""

from __future__ import annotations

from dataclasses import dataclass
from math import asin, cos, radians, sin, sqrt

from app.config import Settings, get_settings

EARTH_RADIUS_KM = 6371.0088


@dataclass(frozen=True)
class StationPosition:
    station_id: str
    latitude: float
    longitude: float


@dataclass(frozen=True)
class PropagationForecast:
    """A predicted future risk: contamination detected at `source_station_id`
    is modeled to reach `target_station_id` in about `eta_minutes`."""

    source_station_id: str
    target_station_id: str
    distance_km: float
    eta_minutes: float
    probability: float


def _haversine_km(a: StationPosition, b: StationPosition) -> float:
    lat1, lon1, lat2, lon2 = (radians(v) for v in (a.latitude, a.longitude, b.latitude, b.longitude))
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    h = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_KM * asin(sqrt(h))


def nearest_station(positions: dict[str, StationPosition], latitude: float, longitude: float) -> str | None:
    """The station_id whose position is closest (straight-line) to the given
    point, or None if `positions` is empty."""
    if not positions:
        return None
    query = StationPosition(station_id="__query__", latitude=latitude, longitude=longitude)
    return min(positions, key=lambda station_id: _haversine_km(query, positions[station_id]))


def compute_forecasts(
    flow_order: list[str],
    positions: dict[str, StationPosition],
    flagged_station_ids: set[str],
    settings: Settings | None = None,
) -> list[PropagationForecast]:
    """For every flagged station, walk downstream through `flow_order`,
    accumulating distance, and emit one forecast per downstream station that
    isn't already itself flagged (nothing to predict for a confirmed hit)
    and whose ETA falls within `propagation_horizon_minutes`.

    If more than one upstream station could reach the same downstream
    target, the soonest (minimum ETA) forecast wins.
    """
    settings = settings or get_settings()
    velocity_m_s = settings.propagation_flow_velocity_m_s
    horizon_minutes = settings.propagation_horizon_minutes

    best_by_target: dict[str, PropagationForecast] = {}

    for start_index, source_id in enumerate(flow_order):
        if source_id not in flagged_station_ids or source_id not in positions:
            continue
        cumulative_km = 0.0
        previous = positions[source_id]
        for target_id in flow_order[start_index + 1:]:
            if target_id not in positions:
                break
            current = positions[target_id]
            cumulative_km += _haversine_km(previous, current)
            previous = current
            if target_id in flagged_station_ids:
                continue  # Already confirmed downstream -- nothing to forecast.

            eta_minutes = (cumulative_km * 1000.0) / velocity_m_s / 60.0
            if eta_minutes > horizon_minutes:
                continue

            probability = max(0.15, min(0.9, 1.0 - eta_minutes / horizon_minutes))
            forecast = PropagationForecast(
                source_station_id=source_id,
                target_station_id=target_id,
                distance_km=round(cumulative_km, 3),
                eta_minutes=round(eta_minutes, 1),
                probability=round(probability, 2),
            )
            existing = best_by_target.get(target_id)
            if existing is None or forecast.eta_minutes < existing.eta_minutes:
                best_by_target[target_id] = forecast

    return sorted(best_by_target.values(), key=lambda f: f.eta_minutes)
