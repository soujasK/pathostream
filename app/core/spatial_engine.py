"""Shapely-based point-in-polygon matching against active catchment boundaries.

The CDS Hooks patient-view flow needs to answer, in sub-millisecond time:
"does this patient's home address fall inside a catchment that currently
has an active biohazard flag?" This module owns that spatial index.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from shapely.geometry import Point, shape
from shapely.geometry.base import BaseGeometry
from shapely.prepared import PreparedGeometry, prep

DEFAULT_CATCHMENT_GEOJSON = Path(__file__).resolve().parent.parent / "data" / "mithi_catchment.geojson"


@dataclass(frozen=True)
class CatchmentMatch:
    """Result of a spatial lookup for one (lat, lon) point."""

    matched: bool
    catchment_id: str | None
    catchment_name: str | None


class CatchmentIndex:
    """An in-memory spatial index of catchment polygons loaded from GeoJSON.

    Geometries are pre-prepared (`shapely.prepared.prep`) at load time so
    that repeated `contains` checks during CDS Hooks evaluation are fast
    and allocation-free, which is what makes the sub-300ms latency budget
    in `tests/test_cds_hooks.py` achievable even with several catchments
    loaded.
    """

    def __init__(self, geojson_path: Path = DEFAULT_CATCHMENT_GEOJSON) -> None:
        self._geojson_path = geojson_path
        self._catchments: list[tuple[str, str, PreparedGeometry[BaseGeometry]]] = []
        self._flow_orders: dict[str, list[str]] = {}
        self._load()

    def _load(self) -> None:
        with self._geojson_path.open("r", encoding="utf-8") as fh:
            collection = json.load(fh)

        if collection.get("type") != "FeatureCollection":
            raise ValueError(f"{self._geojson_path} is not a GeoJSON FeatureCollection")

        for feature in collection.get("features", []):
            props = feature.get("properties", {})
            catchment_id = props.get("catchment_id")
            catchment_name = props.get("name", catchment_id)
            if not catchment_id:
                raise ValueError(f"Feature missing required 'catchment_id' property: {feature}")
            geometry = shape(feature["geometry"])
            self._catchments.append((catchment_id, catchment_name, prep(geometry)))
            flow_order = props.get("station_flow_order")
            if flow_order:
                self._flow_orders[catchment_id] = list(flow_order)

    def flow_order(self, catchment_id: str) -> list[str]:
        """Upstream-to-downstream station order for this catchment, if the
        source GeoJSON declares one (see `station_flow_order` in
        `app/data/mithi_catchment.geojson`). Empty list if undeclared --
        callers should treat that as "no propagation forecasting available
        for this catchment", not an error."""
        return list(self._flow_orders.get(catchment_id, []))

    def locate(self, latitude: float, longitude: float) -> CatchmentMatch:
        """Return the first catchment (if any) containing the given point.

        GeoJSON coordinate order is [longitude, latitude]; Shapely `Point`
        follows the same (x, y) = (lon, lat) convention, which is easy to
        transpose by accident -- kept explicit here on purpose.
        """
        point = Point(longitude, latitude)
        for catchment_id, catchment_name, prepared_geom in self._catchments:
            if prepared_geom.contains(point):
                return CatchmentMatch(matched=True, catchment_id=catchment_id, catchment_name=catchment_name)
        return CatchmentMatch(matched=False, catchment_id=None, catchment_name=None)

    def catchment_ids(self) -> list[str]:
        return [catchment_id for catchment_id, _, _ in self._catchments]
