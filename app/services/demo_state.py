"""In-memory CCI history for the demo frontend (React/MapLibre/Recharts).

This is presentation scaffolding, not part of the core ingestion pipeline --
`app/services/ingest_service.py`'s `_CatchmentStateCache` remains the single
source of truth for "current" per-station state. This module only remembers
the last `MAX_HISTORY_PER_CATCHMENT` ticks so the dashboard can draw a CCI
trend line, independent of whether any station is currently flagged.
"""

from __future__ import annotations

import threading

from pydantic import BaseModel

#: How many ticks of history to retain per catchment before trimming the oldest.
MAX_HISTORY_PER_CATCHMENT = 60


class HistoryPoint(BaseModel):
    tick: int
    station_id: str
    cci: float
    biohazard_flag_active: bool
    observed_at: str


class _DemoHistoryStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._ticks: dict[str, int] = {}
        self._history: dict[str, list[HistoryPoint]] = {}

    def next_tick(self, catchment_id: str) -> int:
        """Allocate one tick number, shared by every station reading recorded
        for the same logical ingest round (see `POST /demo/tick`), so the
        frontend trend chart gets one x-axis point per round, not one per
        station."""
        with self._lock:
            tick = self._ticks.get(catchment_id, 0) + 1
            self._ticks[catchment_id] = tick
            return tick

    def record(
        self, *, catchment_id: str, tick: int, station_id: str, cci: float, flagged: bool, observed_at: str
    ) -> None:
        with self._lock:
            points = self._history.setdefault(catchment_id, [])
            points.append(
                HistoryPoint(
                    tick=tick,
                    station_id=station_id,
                    cci=cci,
                    biohazard_flag_active=flagged,
                    observed_at=observed_at,
                )
            )
            if len(points) > MAX_HISTORY_PER_CATCHMENT:
                del points[: len(points) - MAX_HISTORY_PER_CATCHMENT]

    def get(self, catchment_id: str) -> list[HistoryPoint]:
        with self._lock:
            return list(self._history.get(catchment_id, []))

    def reset(self) -> None:
        with self._lock:
            self._ticks.clear()
            self._history.clear()


demo_history = _DemoHistoryStore()
