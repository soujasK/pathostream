"""Ingestion pipeline: turns raw `TelemetryEvent`s into `IndicatorsOah`
records and keeps an in-memory "latest state per catchment" cache that the
CDS Hooks service consults during patient-view evaluation.

This is intentionally a simple process-local cache (a plain dict behind a
lock), not a database -- appropriate for a demo/prototype whose FastAPI
process and Streamlit dashboard are meant to run together. A real
deployment would replace `_CatchmentStateCache` with a shared store (e.g.
Redis) so multiple API workers see the same state.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass

from app.config import Settings, get_settings
from app.core.anomaly_engine import CciInputs, compute_bio_risk
from app.core.fhir_compiler import compile_bundle
from app.models.fhir_resources import BundleResource
from app.models.oah_indicators import IndicatorsOah
from app.models.telemetry import TelemetryEvent


class _CatchmentStateCache:
    """Thread-safe last-known-IndicatorsOah-per-station cache, with a
    catchment-level view that never silently drops an active alert.

    A catchment can contain several monitoring stations (see
    `simulator/stream_generator.py`'s six demo stations, all inside the
    single `mithi-river-mumbai` catchment). Early versions of this cache
    stored only "the latest indicators for this catchment_id", which meant
    ingesting a healthy reading from station B *after* a biohazard reading
    from station A silently erased station A's active flag -- exactly the
    "never drop an alert for an in-catchment patient" failure the spec
    explicitly calls out. Storing per-station and having `get()` prefer any
    currently-active station within the catchment fixes that.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        # catchment_id -> { station_id -> latest IndicatorsOah for that station }
        self._state: dict[str, dict[str, IndicatorsOah]] = {}

    def put(self, indicators: IndicatorsOah) -> None:
        with self._lock:
            per_station = self._state.setdefault(indicators.catchment_id, {})
            per_station[indicators.station_id] = indicators

    def get(self, catchment_id: str) -> IndicatorsOah | None:
        """Return the most safety-relevant reading for this catchment.

        Prefers any station currently showing an active biohazard flag
        (breaking ties by highest Catchment Contamination Index); falls
        back to the most recently observed reading if no station in the
        catchment is currently flagged; returns None if the catchment has
        no data at all yet.
        """
        with self._lock:
            per_station = self._state.get(catchment_id)
            if not per_station:
                return None
            readings = list(per_station.values())

        active = [r for r in readings if r.bio_risk.biohazard_flag_active]
        if active:
            return max(active, key=lambda r: r.bio_risk.catchment_contamination_index)
        return max(readings, key=lambda r: r.observed_at)

    def all_catchments(self) -> dict[str, dict[str, IndicatorsOah]]:
        with self._lock:
            return {cid: dict(stations) for cid, stations in self._state.items()}

    def reset(self) -> None:
        """Clear all cached state. Used to restart a demo session cleanly."""
        with self._lock:
            self._state.clear()


#: Process-wide singleton. Fine for a single-worker demo deployment; see
#: module docstring for the multi-worker caveat.
catchment_state = _CatchmentStateCache()


@dataclass(frozen=True)
class IngestResult:
    indicators: IndicatorsOah
    bundle: BundleResource


def ingest_event(event: TelemetryEvent, settings: Settings | None = None) -> IngestResult:
    """Validate, score, compile, and cache one telemetry event.

    Returns both the derived `IndicatorsOah` record and the FHIR
    transaction Bundle compiled from it, so callers (the HTTP layer, the
    simulator, the dashboard) can choose whether to also persist the
    Bundle via `app/services/fhir_client.py`.
    """
    settings = settings or get_settings()

    bio_risk = compute_bio_risk(
        CciInputs(
            fecal_coliforms_cfu_100ml=event.assay.fecal_coliforms_cfu_100ml,
            dissolved_oxygen_mg_l=event.sonde.dissolved_oxygen_mg_l,
            diatom_teratology_status=event.assay.diatom_teratology_status,
        ),
        settings=settings,
    )
    indicators = IndicatorsOah.from_telemetry(event, bio_risk)
    catchment_state.put(indicators)

    bundle = compile_bundle(indicators)
    return IngestResult(indicators=indicators, bundle=bundle)
