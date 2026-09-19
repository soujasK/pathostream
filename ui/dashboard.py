"""Streamlit split-screen triage demo: "The River" vs "The Hospital".

Runs entirely in-process against the same `app.*` modules the FastAPI
service uses (ingestion, spatial matching, CDS synthesis) -- no HTTP calls
required, so the demo works with zero extra setup: `streamlit run ui/dashboard.py`.

Left column ("The River"): a Folium map of the Mithi River corridor with
sensor stations that flip from green to red when a simulated sewage
backflow is injected.

Right column ("The Hospital"): a mock ED triage bay for a single demo
patient, showing vitals and the live CDS Hooks card produced by
`app.services.cds_service.handle_patient_view` for whichever station the
user has selected as the patient's home address.
"""

from __future__ import annotations

import html
import sys
from pathlib import Path

# Allow `streamlit run ui/dashboard.py` to import the `app` package without
# requiring the caller to set PYTHONPATH themselves.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import folium  # noqa: E402
import pandas as pd  # noqa: E402
import streamlit as st  # noqa: E402
from streamlit_folium import st_folium  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.core.spatial_engine import CatchmentIndex  # noqa: E402
from app.models.cds_hooks import CdsHookRequest, PatientViewContext  # noqa: E402
from app.services import cds_service  # noqa: E402
from app.services.ingest_service import catchment_state, ingest_event  # noqa: E402
from simulator.stream_generator import (  # noqa: E402
    all_stations,
    breach_reading,
    demo_patient_geolocation_extension,
    normal_reading,
)

st.set_page_config(page_title="PathoStream-EHR", layout="wide")

DISCLAIMER = (
    "**Prototype demo only -- not a certified or cleared medical device.** "
    "Synthetic data. See README.md ('Clinical & regulatory status') before treating "
    "any output here as clinical guidance."
)

EXPLAINER = (
    "**How to read this demo:** synthetic river sensors (left) feed a Catchment Contamination "
    "Index (CCI) -- an ecosystem-health signal in its own right. When a station breaches, that "
    "same signal reaches the ED via a live FHIR + CDS Hooks card (right): one pipeline, from "
    "sensor to bedside alert."
)

#: How many ingest ticks of CCI history to keep per station for the trend chart.
MAX_HISTORY_POINTS = 30

#: Pre-breach one station by default so a cold judge sees the story (flagged marker, critical
#: card) immediately on load, with nothing to click first.
DEFAULT_BREACHED_STATIONS = {"STN-POWAI"}

#: Map marker fill colors; badge/card colors are set in CUSTOM_CSS below.
COLOR_HEALTHY = "#059669"
COLOR_CRITICAL = "#dc2626"

CUSTOM_CSS = """
<style>
.app-subtitle {
    color: #475569;
    font-size: 0.95rem;
    margin-top: -0.6rem;
    margin-bottom: 1rem;
}
.status-badge {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 4px;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    margin-right: 8px;
}
.status-badge.healthy  { background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
.status-badge.critical { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
.status-badge.warning  { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; }
.status-badge.info     { background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; }

.cds-card {
    border-left: 4px solid #2563eb;
    background: #f8fafc;
    padding: 16px 20px;
    border-radius: 6px;
    margin-top: 10px;
}
.cds-card.critical { border-left-color: #dc2626; background: #fef2f2; }
.cds-card.warning  { border-left-color: #d97706; background: #fffbeb; }
.cds-card.info     { border-left-color: #2563eb; background: #eff6ff; }
.cds-summary { font-weight: 700; font-size: 1.05rem; color: #0f172a; margin: 8px 0 6px 0; }
.cds-detail  { color: #334155; font-size: 0.92rem; line-height: 1.55; }
.cds-source  { color: #64748b; font-size: 0.78rem; margin-top: 10px; }
.cds-suggestion { color: #0f172a; font-size: 0.88rem; font-weight: 600; margin-top: 8px; }
.cds-suggestion-desc { color: #64748b; font-size: 0.80rem; margin: 2px 0 0 14px; }
</style>
"""


@st.cache_resource
def get_catchment_index() -> CatchmentIndex:
    return CatchmentIndex()


def _init_session_state() -> None:
    if "breach_stations" not in st.session_state:
        st.session_state.breach_stations: set[str] = set(DEFAULT_BREACHED_STATIONS)
    if "selected_station" not in st.session_state:
        st.session_state.selected_station = all_stations()[0].station_id
    if "cci_history" not in st.session_state:
        st.session_state.cci_history: list[dict[str, float]] = []
    if "tick" not in st.session_state:
        st.session_state.tick = 0


def _ingest_all_stations() -> None:
    """(Re)ingest a reading for every station, honoring the breach toggle set.

    Also records each station's resulting CCI into `cci_history`, so the
    dashboard can plot ecosystem-health trend over time, not just a
    pass/fail flag.
    """
    st.session_state.tick += 1
    row: dict[str, float] = {"tick": st.session_state.tick}
    for station in all_stations():
        if station.station_id in st.session_state.breach_stations:
            event = breach_reading(station)
        else:
            event = normal_reading(station)
        result = ingest_event(event)
        row[station.station_id] = round(result.indicators.bio_risk.catchment_contamination_index, 2)
    st.session_state.cci_history.append(row)
    st.session_state.cci_history = st.session_state.cci_history[-MAX_HISTORY_POINTS:]


def _river_map() -> folium.Map:
    stations = all_stations()
    center = [19.08, 72.875]
    # Plain OpenStreetMap tiles: no API key required (unlike the CartoDB
    # basemaps, which now gate their tiles behind a free API key).
    fmap = folium.Map(location=center, zoom_start=13, tiles="OpenStreetMap")

    for station in stations:
        indicators = catchment_state.get("mithi-river-mumbai")
        is_flagged = station.station_id in st.session_state.breach_stations
        fill_color = COLOR_CRITICAL if is_flagged else COLOR_HEALTHY
        popup = f"{station.station_id}"
        if indicators is not None and is_flagged:
            popup += f"<br/>CCI: {indicators.bio_risk.catchment_contamination_index:.1f}"
        folium.CircleMarker(
            location=[station.latitude, station.longitude],
            radius=12 if is_flagged else 8,
            color="#ffffff",
            weight=2,
            fill=True,
            fill_color=fill_color,
            fill_opacity=0.92,
            tooltip=station.station_id,
            popup=popup,
        ).add_to(fmap)
    return fmap


def _cci_trend_chart() -> None:
    """Plot per-station CCI over successive readings, as continuous ecosystem
    monitoring rather than only a pass/fail biohazard flag."""
    history = st.session_state.cci_history
    if len(history) < 2:
        st.caption("Catchment Contamination Index (CCI) trend will appear here after a couple of readings.")
        return
    df = pd.DataFrame(history).set_index("tick")
    df["Biohazard threshold"] = get_settings().cci_biohazard_threshold
    st.caption(
        "Catchment Contamination Index (CCI) per station over time -- an ecosystem-health "
        "indicator in its own right, independent of whether any hospital ever sees an alert."
    )
    st.line_chart(df, height=220)


def _hospital_bay(catchment_index: CatchmentIndex) -> None:
    selected_id = st.session_state.selected_station
    station = next(s for s in all_stations() if s.station_id == selected_id)
    is_flagged = selected_id in st.session_state.breach_stations

    st.subheader("Triage Bay 3 -- Demo Patient")
    col_a, col_b, col_c = st.columns(3)
    col_a.metric("BP", "85/50 mmHg" if is_flagged else "118/76 mmHg")
    col_b.metric("Temp", "39.2 °C" if is_flagged else "37.0 °C")
    col_c.metric("HR", "122 bpm" if is_flagged else "78 bpm")
    st.caption(f"Home address geocoded to station **{selected_id}** for this demo.")

    beta_lactam_allergy = st.checkbox("Patient has a severe penicillin/beta-lactam allergy", value=False)
    renal_impairment = st.checkbox("Patient has chronic kidney disease on file", value=False)

    prefetch = {
        "patient": {
            "resourceType": "Patient",
            "id": "demo-patient",
            "address": [{"extension": [demo_patient_geolocation_extension(station.latitude, station.longitude)]}],
        },
        "allergies": {
            "resourceType": "Bundle",
            "entry": (
                [
                    {
                        "resource": {
                            "resourceType": "AllergyIntolerance",
                            "code": {"text": "Penicillin"},
                            "reaction": [{"severity": "severe"}],
                        }
                    }
                ]
                if beta_lactam_allergy
                else []
            ),
        },
        "conditions": {
            "resourceType": "Bundle",
            "entry": (
                [{"resource": {"resourceType": "Condition", "code": {"text": "Chronic kidney disease"}}}]
                if renal_impairment
                else []
            ),
        },
    }
    request = CdsHookRequest(
        hookInstance="dashboard-demo",
        hook="patient-view",
        context=PatientViewContext(userId="Practitioner/demo-md", patientId="demo-patient"),
        prefetch=prefetch,
    )
    response = cds_service.handle_patient_view(request, catchment_index)

    st.markdown("---")
    st.markdown("#### CDS Hooks `patient-view` card")
    if not response.cards:
        st.success("No active card. (Healthy catchment, or address not in a flagged catchment.)")
        return

    card = response.cards[0]
    severity = card.indicator
    summary = html.escape(card.summary)
    detail = html.escape(card.detail)
    source_label = html.escape(card.source.label)
    st.markdown(
        f"""
        <div class="cds-card {severity}">
            <span class="status-badge {severity}">{html.escape(severity)}</span>
            <div class="cds-summary">{summary}</div>
            <div class="cds-detail">{detail}</div>
            <div class="cds-source">Source: {source_label}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )
    for suggestion in card.suggestions:
        label = html.escape(suggestion.label)
        st.markdown(f'<div class="cds-suggestion">Suggested order: {label}</div>', unsafe_allow_html=True)
        for action in suggestion.actions:
            description = html.escape(action.description)
            st.markdown(f'<div class="cds-suggestion-desc">{description}</div>', unsafe_allow_html=True)


def main() -> None:
    _init_session_state()
    st.markdown(CUSTOM_CSS, unsafe_allow_html=True)
    st.title("PathoStream-EHR")
    st.markdown(
        '<div class="app-subtitle">One Health clinical decision support -- river water-quality '
        "surveillance linked to emergency-department CDS Hooks alerts.</div>",
        unsafe_allow_html=True,
    )
    st.info(EXPLAINER)
    st.warning(DISCLAIMER)

    catchment_index = get_catchment_index()

    with st.sidebar:
        st.header("Simulator controls")
        st.caption("Toggle a station into an acute sewage-backflow breach state.")
        for station in all_stations():
            breached = st.checkbox(
                station.station_id,
                value=station.station_id in st.session_state.breach_stations,
                key=f"toggle-{station.station_id}",
            )
            if breached:
                st.session_state.breach_stations.add(station.station_id)
            else:
                st.session_state.breach_stations.discard(station.station_id)
        st.session_state.selected_station = st.selectbox(
            "Patient's home address (nearest station)",
            options=[s.station_id for s in all_stations()],
            index=[s.station_id for s in all_stations()].index(st.session_state.selected_station),
        )

    _ingest_all_stations()

    left, right = st.columns(2)
    with left:
        st.header("River Monitoring")
        st.markdown(
            '<span class="status-badge healthy">Healthy</span>'
            '<span class="status-badge critical">Biohazard active</span>',
            unsafe_allow_html=True,
        )
        st_folium(_river_map(), height=520, width=None, returned_objects=[])
        _cci_trend_chart()
    with right:
        st.header("Emergency Department")
        _hospital_bay(catchment_index)


if __name__ == "__main__":
    main()
