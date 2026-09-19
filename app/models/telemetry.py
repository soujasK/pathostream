"""Pydantic schemas for raw upstream sensor telemetry.

These model the two physical data sources described in the engineering
spec:

* A YSI EXO2 multiparameter sonde (optical dissolved oxygen, temperature,
  turbidity, pH) -- continuous electronic telemetry.
* Field biological assays performed with Colilert (fecal-indicator
  bacteria) and Aquagenx (compartment bag test) kits, plus a manual
  diatom-teratology field read -- periodic, human-entered observations.

Nothing here talks to real hardware; `simulator/stream_generator.py`
produces synthetic readings shaped like these models.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field, field_validator


class DiatomTeratologyStatus(str, Enum):
    """Qualitative field read of diatom frustule deformity rates.

    Diatom teratology (frustule malformation) is a recognized biological
    indicator of chronic chemical/organic stress in a water body, used
    alongside chemical indicators rather than as a replacement for them.
    """

    HEALTHY = "healthy"
    MODERATE_STRESS = "moderate_stress"
    ACUTE_COLLAPSE = "acute_collapse"


class YsiExo2Reading(BaseModel):
    """A single instantaneous reading from a YSI EXO2 sonde deployment.

    Units follow the sonde's native optical/electrochemical sensor outputs;
    UCUM-compatible unit strings are attached for downstream FHIR mapping
    (see `app/core/fhir_compiler.py`).
    """

    station_id: str = Field(..., description="Sonde deployment / station identifier.")
    observed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    dissolved_oxygen_mg_l: float = Field(..., ge=0, description="Optical DO, mg/L.")
    temperature_c: float = Field(..., ge=-5, le=60, description="Water temperature, degrees Celsius.")
    turbidity_ntu: float = Field(..., ge=0, description="Turbidity, NTU.")
    ph: float = Field(..., ge=0, le=14, description="pH, dimensionless (UCUM [pH]).")

    @field_validator("observed_at")
    @classmethod
    def _ensure_timezone_aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value


class ColilertAquagenxReading(BaseModel):
    """A single field biological-assay reading.

    Fecal-indicator bacteria are reported as a coliform count per 100 mL,
    consistent with standard Colilert/Aquagenx compartment-bag reporting.
    See README.md for the LOINC mapping caveats around this analyte.
    """

    station_id: str = Field(..., description="Field assay / station identifier.")
    observed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    fecal_coliforms_cfu_100ml: float = Field(..., ge=0, description="CFU per 100 mL.")
    diatom_teratology_status: DiatomTeratologyStatus = Field(
        ..., description="Qualitative diatom frustule deformity read."
    )
    vector_diptera_larval_density: float = Field(
        ..., ge=0, description="Diptera (mosquito/vector fly) larvae per liter of sampled water."
    )

    @field_validator("observed_at")
    @classmethod
    def _ensure_timezone_aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value


class TelemetryEvent(BaseModel):
    """A paired sonde + assay reading for one catchment station at one time.

    The ingestion pipeline (`app/services/ingest_service.py`) accepts these
    as the unit of work; the two sub-readings may originate from different
    physical instruments but are correlated by station and a shared
    collection window upstream of this model.
    """

    catchment_id: str = Field(..., description="Identifier of the river catchment polygon this station sits in.")
    sonde: YsiExo2Reading
    assay: ColilertAquagenxReading
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
