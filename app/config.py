"""Application configuration.

PathoStream-EHR is a hackathon/prototype-grade One Health interoperability
demo. It is NOT a cleared or certified medical device. All configuration
defaults below point at local/sandbox endpoints on purpose -- see
README.md ("Clinical & regulatory status") before pointing any of this at
real infrastructure.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-driven settings for the PathoStream-EHR service.

    All fields have safe, local-only defaults so the service can boot and
    run its deterministic (non-LLM) code paths with zero configuration.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- Gemini clinical synthesis ---
    gemini_api_key: str = Field(default="", description="Empty disables Gemini synthesis.")
    gemini_model: str = Field(default="gemini-1.5-flash")
    gemini_timeout_seconds: float = Field(default=2.5, gt=0)

    # --- FHIR sandbox persistence ---
    fhir_base_url: str = Field(default="http://localhost:8080/fhir")
    fhir_timeout_seconds: float = Field(default=5.0, gt=0)

    # --- Catchment Contamination Index (CCI) thresholds ---
    cci_biohazard_threshold: float = Field(default=25.0, gt=0)
    cci_low_do_mg_l: float = Field(default=2.0, gt=0)
    cci_high_coliform_cfu_100ml: float = Field(default=1000.0, gt=0)

    # --- Downstream contamination-propagation forecasting (resilience/early-warning) ---
    propagation_flow_velocity_m_s: float = Field(
        default=0.3,
        gt=0,
        description=(
            "Assumed uniform surface-flow velocity used for downstream arrival-time "
            "forecasting (see app/core/propagation_engine.py). An illustrative default "
            "for a slow, monsoon-drain-fed urban channel -- NOT sourced from real Mithi "
            "River discharge/velocity gauge data. Replace before treating any forecast "
            "ETA as operationally meaningful."
        ),
    )
    propagation_horizon_minutes: float = Field(
        default=240.0,
        gt=0,
        description="Forecast horizon in minutes; downstream stations beyond this predicted ETA are not forecast.",
    )

    # --- Service ---
    app_env: str = Field(default="development")
    log_level: str = Field(default="INFO")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a process-wide cached Settings instance."""
    return Settings()
