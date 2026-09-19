"""PathoStream-EHR FastAPI gateway.

Endpoints:
  GET  /health                        liveness check
  POST /ingest                        submit one TelemetryEvent
  GET  /cds-services                  CDS Hooks discovery manifest
  POST /cds-services/patient-view     CDS Hooks patient-view hook
  POST /persist/{catchment_id}        POST that catchment's latest Bundle to the FHIR sandbox

  Demo-frontend scaffolding (backs the React/MapLibre/Recharts dashboard in
  `web/`; not part of the core CDS Hooks / FHIR product surface above):
  GET  /demo/stations                 static demo station list (id, lat, lon)
  POST /demo/tick                     (re)ingest all demo stations for one tick, incl. propagation forecast
  GET  /demo/history/{catchment_id}   recent per-station CCI history for charting
  GET  /demo/forecast-bundle/{catchment_id}  FHIR RiskAssessment Bundle of predicted downstream risk
  POST /demo/reset                    clear cached state + history for a fresh run
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.config import get_settings
from app.core.fhir_compiler import compile_forecast_bundle
from app.core.propagation_engine import PropagationForecast, StationPosition, compute_forecasts
from app.core.spatial_engine import CatchmentIndex
from app.models.cds_hooks import CdsDiscoveryResponse, CdsHookRequest, CdsHookResponse
from app.models.fhir_resources import BundleResource
from app.models.telemetry import TelemetryEvent
from app.services import cds_service
from app.services.demo_state import HistoryPoint, demo_history
from app.services.fhir_client import FhirClientError, post_transaction_bundle
from app.services.ingest_service import IngestResult, catchment_state, ingest_event
from simulator.stream_generator import DEMO_CATCHMENT_ID, all_stations, breach_reading, normal_reading

logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="PathoStream-EHR",
    description=(
        "Prototype One Health interoperability engine connecting river telemetry to "
        "emergency CDS. NOT a cleared medical device -- see README.md."
    ),
    version="0.1.0",
)

# Dev-only: lets the Vite dev server (web/) and the static root landing
# page (index.html, served from any local static-file port) call this API
# directly. Tighten or remove before any real deployment -- see README's
# "not implemented" section on auth.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_methods=["*"],
    allow_headers=["*"],
)

# Loaded once at import time; safe because the GeoJSON is static demo data.
_catchment_index = CatchmentIndex()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/ingest", response_model=None)
def ingest(event: TelemetryEvent) -> dict[str, object]:
    """Ingest one telemetry event; returns the derived indicators + compiled Bundle."""
    result: IngestResult = ingest_event(event)
    return {
        "indicators": result.indicators.model_dump(mode="json"),
        "bundle": result.bundle.model_dump(mode="json", exclude_none=True),
    }


@app.get("/cds-services", response_model=CdsDiscoveryResponse)
def cds_discovery() -> CdsDiscoveryResponse:
    return cds_service.discovery_manifest()


@app.post("/cds-services/patient-view", response_model=CdsHookResponse)
def cds_patient_view(request: CdsHookRequest) -> CdsHookResponse:
    return cds_service.handle_patient_view(request, _catchment_index)


@app.post("/persist/{catchment_id}")
def persist_catchment(catchment_id: str) -> dict[str, object]:
    """Compile the catchment's latest cached indicators and POST to the FHIR sandbox."""
    from app.core.fhir_compiler import compile_bundle

    indicators = catchment_state.get(catchment_id)
    if indicators is None:
        raise HTTPException(status_code=404, detail=f"No ingested data for catchment '{catchment_id}'")

    bundle = compile_bundle(indicators)
    try:
        result = post_transaction_bundle(bundle)
    except FhirClientError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {"status_code": result.status_code, "created_resource_ids": result.created_resource_ids}


# --- Demo-frontend scaffolding ----------------------------------------------
# Everything below exists to feed the React dashboard in `web/` real backend
# output (never fabricated in the browser): station coordinates and simulated
# sensor readings both come from `simulator/stream_generator.py`, run here on
# the server, same as the FastAPI /ingest path above.


class StationInfo(BaseModel):
    station_id: str
    latitude: float
    longitude: float


class DemoTickRequest(BaseModel):
    breached_station_ids: list[str] = []


class StationReading(BaseModel):
    station_id: str
    latitude: float
    longitude: float
    cci: float
    biohazard_flag_active: bool
    rationale: str
    observed_at: str


class ForecastEntry(BaseModel):
    source_station_id: str
    target_station_id: str
    distance_km: float
    eta_minutes: float
    probability: float


class DemoTickResponse(BaseModel):
    catchment_id: str
    tick: int
    stations: list[StationReading]
    history: list[HistoryPoint]
    forecast: list[ForecastEntry]


class DemoConfig(BaseModel):
    cci_biohazard_threshold: float


@app.get("/demo/config", response_model=DemoConfig)
def demo_config() -> DemoConfig:
    return DemoConfig(cci_biohazard_threshold=get_settings().cci_biohazard_threshold)


@app.get("/demo/stations", response_model=list[StationInfo])
def demo_stations() -> list[StationInfo]:
    return [StationInfo(station_id=s.station_id, latitude=s.latitude, longitude=s.longitude) for s in all_stations()]


_CATCHMENT_GEOJSON_PATH = Path(__file__).resolve().parent / "data" / "mithi_catchment.geojson"


@app.get("/demo/catchment-boundary")
def demo_catchment_boundary() -> dict[str, object]:
    """Raw GeoJSON for the (illustrative, simplified) monitored catchment
    polygon -- see README.md 'Data provenance' -- so the map can draw the
    real surveilled corridor instead of only station points."""
    with _CATCHMENT_GEOJSON_PATH.open("r", encoding="utf-8") as fh:
        result: dict[str, object] = json.load(fh)
        return result


@app.post("/demo/tick", response_model=DemoTickResponse)
def demo_tick(request: DemoTickRequest) -> DemoTickResponse:
    """(Re)ingest a fresh reading for every demo station in one round trip.

    Stations in `breached_station_ids` get a `breach_reading()`; everyone
    else gets a `normal_reading()`. Mirrors `ui/dashboard.py`'s
    `_ingest_all_stations()`, but as an HTTP endpoint the React frontend can
    poll/call on a timer instead of duplicating simulation logic in JS.
    """
    breached = set(request.breached_station_ids)
    tick = demo_history.next_tick(DEMO_CATCHMENT_ID)
    readings: list[StationReading] = []
    for station in all_stations():
        event = breach_reading(station) if station.station_id in breached else normal_reading(station)
        result: IngestResult = ingest_event(event)
        indicators = result.indicators
        demo_history.record(
            catchment_id=indicators.catchment_id,
            tick=tick,
            station_id=indicators.station_id,
            cci=indicators.bio_risk.catchment_contamination_index,
            flagged=indicators.bio_risk.biohazard_flag_active,
            observed_at=indicators.observed_at.isoformat(),
        )
        readings.append(
            StationReading(
                station_id=indicators.station_id,
                latitude=indicators.latitude,
                longitude=indicators.longitude,
                cci=indicators.bio_risk.catchment_contamination_index,
                biohazard_flag_active=indicators.bio_risk.biohazard_flag_active,
                rationale=indicators.bio_risk.rationale,
                observed_at=indicators.observed_at.isoformat(),
            )
        )
    history = demo_history.get(DEMO_CATCHMENT_ID)

    positions = {r.station_id: StationPosition(r.station_id, r.latitude, r.longitude) for r in readings}
    flagged_ids = {r.station_id for r in readings if r.biohazard_flag_active}
    flow_order = _catchment_index.flow_order(DEMO_CATCHMENT_ID)
    forecasts = [
        ForecastEntry(
            source_station_id=f.source_station_id,
            target_station_id=f.target_station_id,
            distance_km=f.distance_km,
            eta_minutes=f.eta_minutes,
            probability=f.probability,
        )
        for f in compute_forecasts(flow_order, positions, flagged_ids)
    ]

    return DemoTickResponse(
        catchment_id=DEMO_CATCHMENT_ID, tick=tick, stations=readings, history=history, forecast=forecasts
    )


@app.get("/demo/history/{catchment_id}", response_model=list[HistoryPoint])
def demo_history_endpoint(catchment_id: str) -> list[HistoryPoint]:
    return demo_history.get(catchment_id)


@app.get("/demo/forecast-bundle/{catchment_id}", response_model=BundleResource)
def demo_forecast_bundle(catchment_id: str) -> BundleResource:
    """The current downstream-propagation forecast as a real FHIR R4
    transaction Bundle of `preliminary`-status RiskAssessment resources
    (see `app/core/fhir_compiler.py::compile_forecast_bundle`) -- for
    inspecting the actual standards output behind the dashboard's forecast
    panel, not just the plain-JSON `forecast` field on `/demo/tick`.
    """
    catchment_readings = catchment_state.all_catchments().get(catchment_id, {})
    positions = {
        station_id: StationPosition(station_id, ind.latitude, ind.longitude)
        for station_id, ind in catchment_readings.items()
    }
    flagged_ids = {sid for sid, ind in catchment_readings.items() if ind.bio_risk.biohazard_flag_active}
    flow_order = _catchment_index.flow_order(catchment_id)
    forecasts: list[PropagationForecast] = compute_forecasts(flow_order, positions, flagged_ids)
    return compile_forecast_bundle(catchment_id, forecasts)


@app.post("/demo/reset")
def demo_reset() -> dict[str, str]:
    """Clear cached catchment state + CCI history, for a clean demo restart."""
    catchment_state.reset()
    demo_history.reset()
    return {"status": "reset"}
