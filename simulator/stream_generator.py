"""Synthetic YSI EXO2 + Colilert/Aquagenx sensor stream generator.

Produces `TelemetryEvent`s for a small set of stations scattered across the
demo catchment, in two modes:

  * `normal_reading()`      -- healthy baseline water quality.
  * `breach_reading()`      -- a sewage-backflow-style acute contamination
                                event (low DO, high coliforms, diatom
                                collapse) guaranteed to cross the default
                                biohazard threshold.

Nothing here talks to real hardware; station coordinates are sampled
within `app/data/mithi_catchment.geojson`'s polygon so the spatial engine
will match them.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import TypedDict

from app.core.spatial_engine import CatchmentIndex
from app.models.telemetry import (
    ColilertAquagenxReading,
    DiatomTeratologyStatus,
    TelemetryEvent,
    YsiExo2Reading,
)

DEMO_CATCHMENT_ID = "mithi-river-mumbai"

#: A handful of named demo stations along the corridor (lon, lat), chosen
#: to sit inside `app/data/mithi_catchment.geojson`'s buffered polygon.
DEMO_STATIONS: dict[str, tuple[float, float]] = {
    "STN-POWAI": (72.9060, 19.1176),
    "STN-SAKINAKA": (72.8877, 19.1075),
    "STN-KURLA": (72.8826, 19.0728),
    "STN-BKC": (72.8679, 19.0669),
    "STN-DHARAVI": (72.8500, 19.0430),
    "STN-MAHIM": (72.8400, 19.0410),
}


@dataclass(frozen=True)
class StationLocation:
    station_id: str
    longitude: float
    latitude: float


def all_stations() -> list[StationLocation]:
    return [StationLocation(station_id=sid, longitude=lon, latitude=lat) for sid, (lon, lat) in DEMO_STATIONS.items()]


class _BaseEventFields(TypedDict):
    catchment_id: str
    latitude: float
    longitude: float


def _base_event(station: StationLocation) -> _BaseEventFields:
    return {
        "catchment_id": DEMO_CATCHMENT_ID,
        "latitude": station.latitude,
        "longitude": station.longitude,
    }


def normal_reading(station: StationLocation, rng: random.Random | None = None) -> TelemetryEvent:
    """A healthy-baseline reading for one station."""
    rng = rng or random.Random()
    sonde = YsiExo2Reading(
        station_id=station.station_id,
        dissolved_oxygen_mg_l=round(rng.uniform(5.5, 8.0), 2),
        temperature_c=round(rng.uniform(24.0, 29.0), 1),
        turbidity_ntu=round(rng.uniform(5.0, 25.0), 1),
        ph=round(rng.uniform(6.8, 7.6), 2),
    )
    assay = ColilertAquagenxReading(
        station_id=station.station_id,
        fecal_coliforms_cfu_100ml=round(rng.uniform(50, 400), 0),
        diatom_teratology_status=DiatomTeratologyStatus.HEALTHY,
        vector_diptera_larval_density=round(rng.uniform(0, 2), 2),
    )
    return TelemetryEvent(sonde=sonde, assay=assay, **_base_event(station))


def breach_reading(station: StationLocation, rng: random.Random | None = None) -> TelemetryEvent:
    """An acute sewage-backflow-style contamination reading.

    Tuned so that, with the default settings in `app/config.py`
    (threshold 25.0, low_do 2.0 mg/L, high_coliform 1000 CFU/100mL), this
    ALWAYS trips the biohazard flag via both the CCI-threshold path and
    the acute-signature path.
    """
    rng = rng or random.Random()
    sonde = YsiExo2Reading(
        station_id=station.station_id,
        dissolved_oxygen_mg_l=round(rng.uniform(0.3, 1.2), 2),
        temperature_c=round(rng.uniform(28.0, 33.0), 1),
        turbidity_ntu=round(rng.uniform(150.0, 400.0), 1),
        ph=round(rng.uniform(6.0, 6.5), 2),
    )
    assay = ColilertAquagenxReading(
        station_id=station.station_id,
        fecal_coliforms_cfu_100ml=round(rng.uniform(4000, 12000), 0),
        diatom_teratology_status=DiatomTeratologyStatus.ACUTE_COLLAPSE,
        vector_diptera_larval_density=round(rng.uniform(15, 40), 2),
    )
    return TelemetryEvent(sonde=sonde, assay=assay, **_base_event(station))


def demo_patient_geolocation_extension(latitude: float, longitude: float) -> dict[str, object]:
    """Build the FHIR `geolocation` extension used by `cds_service._extract_address`.

    Handy for constructing demo/test Patient prefetch resources without
    duplicating the extension shape everywhere.
    """
    return {
        "url": "http://hl7.org/fhir/StructureDefinition/geolocation",
        "extension": [
            {"url": "latitude", "valueDecimal": latitude},
            {"url": "longitude", "valueDecimal": longitude},
        ],
    }


if __name__ == "__main__":
    # Smoke-test: confirm every demo station's coordinates actually fall
    # inside the shipped catchment polygon (a station outside it would
    # never be able to trigger the CDS Hooks spatial match).
    index = CatchmentIndex()
    for station in all_stations():
        match = index.locate(station.latitude, station.longitude)
        print(f"{station.station_id}: matched={match.matched} catchment={match.catchment_id}")
