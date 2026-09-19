"""Minimal HAPI FHIR REST client for posting transaction Bundles.

Talks to whatever `settings.fhir_base_url` points at -- a local HAPI FHIR
docker container or a public sandbox such as https://hapi.fhir.org/baseR4.
NEVER point this at a production EHR's FHIR API; see README.md.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx

from app.config import Settings, get_settings
from app.models.fhir_resources import BundleResource

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class FhirPostResult:
    status_code: int
    created_resource_ids: list[str]
    raw_response: dict[str, object]


class FhirClientError(RuntimeError):
    """Raised when the FHIR server returns something other than 200/201."""


def post_transaction_bundle(bundle: BundleResource, settings: Settings | None = None) -> FhirPostResult:
    """POST a transaction Bundle to the configured FHIR base URL.

    On HTTP 200/201, extracts each entry's `response.location`-derived
    resource id from the Bundle-type response HAPI FHIR returns, logs
    them, and returns them to the caller. Raises `FhirClientError` on any
    other status so ingestion code can decide how to handle a persistence
    failure (the CDS Hooks alerting path in `cds_service.py` does NOT
    depend on this succeeding -- alerts must still fire even if the FHIR
    sandbox is down).
    """
    settings = settings or get_settings()
    url = settings.fhir_base_url.rstrip("/")
    payload = bundle.model_dump(mode="json", exclude_none=True)

    with httpx.Client(timeout=settings.fhir_timeout_seconds) as client:
        response = client.post(
            url,
            json=payload,
            headers={"Content-Type": "application/fhir+json"},
        )

    if response.status_code not in (200, 201):
        raise FhirClientError(
            f"FHIR server {url} returned HTTP {response.status_code}: {response.text[:500]}"
        )

    body = response.json()
    created_ids: list[str] = []
    for entry in body.get("entry", []):
        entry_response = entry.get("response", {})
        location = entry_response.get("location")
        if location:
            created_ids.append(location)
            logger.info("FHIR resource persisted: %s", location)

    return FhirPostResult(status_code=response.status_code, created_resource_ids=created_ids, raw_response=body)
