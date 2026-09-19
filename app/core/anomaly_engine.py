"""Multi-stressor Limnological Index: Catchment Contamination Index (CCI).

Implements the deterministic formula from the engineering spec:

    CCI = (Coliforms / 100) + (5.0 / max(DO, 0.1)) + DiatomStressWeight

with the biohazard trigger:

    CCI >= threshold  OR  (DO < low_do  AND  Coliforms > high_coliform)

DiatomStressWeight is a categorical penalty for the qualitative diatom
teratology field read. The spec names the three categories
(healthy / moderate_stress / acute_collapse) but does not give numeric
weights for them, so this module assigns explicit, documented weights
(see `DIATOM_STRESS_WEIGHTS` below) rather than silently guessing inside
the formula. Treat these specific numbers as a tunable prototype default,
not a validated environmental-science constant -- recalibrate against real
regional water-quality data before relying on them.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.config import Settings, get_settings
from app.models.oah_indicators import BioRiskIndicators
from app.models.telemetry import DiatomTeratologyStatus

#: Documented, tunable weight added to the CCI per diatom-teratology category.
#: Not sourced from the engineering spec (which left these unspecified);
#: chosen so that ACUTE_COLLAPSE alone cannot single-handedly cross a
#: default threshold of 25.0, but meaningfully compounds with chemical
#: stressors that are already elevated.
DIATOM_STRESS_WEIGHTS: dict[DiatomTeratologyStatus, float] = {
    DiatomTeratologyStatus.HEALTHY: 0.0,
    DiatomTeratologyStatus.MODERATE_STRESS: 5.0,
    DiatomTeratologyStatus.ACUTE_COLLAPSE: 15.0,
}


@dataclass(frozen=True)
class CciInputs:
    """The subset of a telemetry event the CCI formula depends on."""

    fecal_coliforms_cfu_100ml: float
    dissolved_oxygen_mg_l: float
    diatom_teratology_status: DiatomTeratologyStatus


def compute_cci(inputs: CciInputs) -> float:
    """Compute the Catchment Contamination Index for one reading.

    `max(DO, 0.1)` guards the division against a zero or negative DO
    reading (which would otherwise blow up or invert the term).
    """
    coliform_term = inputs.fecal_coliforms_cfu_100ml / 100.0
    do_term = 5.0 / max(inputs.dissolved_oxygen_mg_l, 0.1)
    diatom_term = DIATOM_STRESS_WEIGHTS[inputs.diatom_teratology_status]
    return coliform_term + do_term + diatom_term


def compute_bio_risk(inputs: CciInputs, settings: Settings | None = None) -> BioRiskIndicators:
    """Compute the full `BioRiskIndicators` block, including the biohazard flag.

    The flag fires on EITHER of the two spec conditions:
      1. CCI >= `cci_biohazard_threshold`, or
      2. DO < `cci_low_do_mg_l` AND Coliforms > `cci_high_coliform_cfu_100ml`.
    Condition 2 exists so that a station can trip the flag on a severe,
    narrowly-defined hypoxia + raw-sewage signature even if the composite
    CCI number hasn't yet crossed threshold (e.g. right at the start of a
    fast-developing sewage backflow event).
    """
    settings = settings or get_settings()
    cci = compute_cci(inputs)

    threshold_breach = cci >= settings.cci_biohazard_threshold
    acute_signature = (
        inputs.dissolved_oxygen_mg_l < settings.cci_low_do_mg_l
        and inputs.fecal_coliforms_cfu_100ml > settings.cci_high_coliform_cfu_100ml
    )
    biohazard_flag_active = threshold_breach or acute_signature

    reasons: list[str] = []
    if threshold_breach:
        reasons.append(f"CCI {cci:.2f} >= threshold {settings.cci_biohazard_threshold:.2f}")
    if acute_signature:
        reasons.append(
            f"DO {inputs.dissolved_oxygen_mg_l:.2f} mg/L < {settings.cci_low_do_mg_l:.2f} mg/L "
            f"AND coliforms {inputs.fecal_coliforms_cfu_100ml:.0f} CFU/100mL "
            f"> {settings.cci_high_coliform_cfu_100ml:.0f} CFU/100mL"
        )
    rationale = "; ".join(reasons) if reasons else f"CCI {cci:.2f} below threshold; no acute signature"

    return BioRiskIndicators(
        catchment_contamination_index=cci,
        biohazard_flag_active=biohazard_flag_active,
        rationale=rationale,
    )
