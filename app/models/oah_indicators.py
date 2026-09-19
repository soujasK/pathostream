"""IndicatorsOah-inspired logical model.

IMPORTANT PROVENANCE NOTE
--------------------------
`hl7.eu.fhir.oah` refers to the real "OneAquaHealth" (OAH) EU project's FHIR
implementation guide, published as a continuous-integration build at
https://build.fhir.org/ig/hl7-eu/oah/ (source: https://github.com/hl7-eu/oah).
As of this writing that guide is explicitly marked "not an authorized
publication" / "changes regularly", and its `IndicatorsOah` logical model
confirmed publicly includes at least a `biological` branch (with
sub-indicators such as `biological.macroinvertebreates` and
`biological.diatomes`). We could not independently confirm, element for
element, the `water` / `bioRisk` branch names and cardinalities the original
engineering prompt asserted, because the guide is an unballoted draft that
changes over time.

The classes below are therefore a **reasonable, good-faith structural
interpretation** of the three logical groupings described in the prompt
(water / biological / bioRisk), built to be internally consistent and to
compile cleanly into FHIR R4 Observations -- they are NOT guaranteed to be
byte-for-byte conformant with whatever the live `hl7-eu/oah` build currently
says. Before treating any Bundle produced by this codebase as OAH-conformant,
diff this model against the current build.fhir.org/ig/hl7-eu/oah/ output.
"""

from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, Field

from app.models.telemetry import DiatomTeratologyStatus, TelemetryEvent


class WaterIndicators(BaseModel):
    """Physicochemical water-quality indicators (OAH `water` grouping)."""

    dissolved_oxygen_mg_l: float = Field(..., ge=0)
    temperature_c: float
    turbidity_ntu: float = Field(..., ge=0)
    ph: float = Field(..., ge=0, le=14)


class BiologicalIndicators(BaseModel):
    """Biological water-quality indicators (OAH `biological` grouping).

    `fecal_indicator_bacteria_cfu_100ml` corresponds to the coliform count
    reported by the Colilert/Aquagenx field assay. `diatom_teratology_status`
    mirrors the OAH `biological.diatomes` sub-indicator's intent (frustule
    deformity as a chronic-stress proxy), reported here as the qualitative
    field read rather than a quantitative deformity index.
    """

    fecal_indicator_bacteria_cfu_100ml: float = Field(..., ge=0)
    diatom_teratology_status: DiatomTeratologyStatus
    vector_diptera_larval_density: float = Field(..., ge=0)


class BioRiskIndicators(BaseModel):
    """Derived One Health biological-risk indicators (OAH `bioRisk` grouping).

    Populated by `app/core/anomaly_engine.py`, not supplied directly by a
    sensor -- this is the computed Catchment Contamination Index (CCI) and
    the boolean biohazard determination derived from it.
    """

    catchment_contamination_index: float = Field(..., ge=0)
    biohazard_flag_active: bool
    rationale: str = Field(..., description="Human-readable explanation of why the flag did/did not fire.")


class IndicatorsOah(BaseModel):
    """Top-level OAH indicator record for one station observation event."""

    catchment_id: str
    station_id: str
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    observed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    water: WaterIndicators
    biological: BiologicalIndicators
    bio_risk: BioRiskIndicators

    @classmethod
    def from_telemetry(
        cls,
        event: TelemetryEvent,
        bio_risk: BioRiskIndicators,
    ) -> "IndicatorsOah":
        """Build an `IndicatorsOah` record from a raw `TelemetryEvent`.

        `bio_risk` must come from `anomaly_engine.compute_bio_risk`, which
        owns the Catchment Contamination Index (CCI) formula -- this method
        never recomputes it, to keep a single source of truth.
        """
        return cls(
            catchment_id=event.catchment_id,
            station_id=event.sonde.station_id,
            latitude=event.latitude,
            longitude=event.longitude,
            observed_at=event.sonde.observed_at,
            water=WaterIndicators(
                dissolved_oxygen_mg_l=event.sonde.dissolved_oxygen_mg_l,
                temperature_c=event.sonde.temperature_c,
                turbidity_ntu=event.sonde.turbidity_ntu,
                ph=event.sonde.ph,
            ),
            biological=BiologicalIndicators(
                fecal_indicator_bacteria_cfu_100ml=event.assay.fecal_coliforms_cfu_100ml,
                diatom_teratology_status=event.assay.diatom_teratology_status,
                vector_diptera_larval_density=event.assay.vector_diptera_larval_density,
            ),
            bio_risk=bio_risk,
        )
