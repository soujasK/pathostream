"""CDS Hooks request/response schemas.

VERSION NOTE: as of this writing, CDS Hooks 2.0.1 (STU2) is HL7's current
*officially published* version; CDS Hooks 3.0.0 exists as a normative
*ballot* (not yet final) at https://cds-hooks.hl7.org -- see the version
picker there for the authoritative status. The `patient-view` hook's core
shapes used here (discovery manifest; hookInstance/hook/context/prefetch on
the request; `cards[]` with uuid/summary/indicator/detail/source/
suggestions on the response) are unchanged between 2.0.1 and the 3.0 ballot
text we reviewed. If a final 3.0 release changes any of these before you
deploy this code, diff against the then-current spec before relying on it.
"""

from __future__ import annotations

from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field


# --- Discovery -------------------------------------------------------------


class CdsServiceDescriptor(BaseModel):
    hook: Literal["patient-view"]
    title: str
    description: str
    id: str
    prefetch: dict[str, str] = Field(default_factory=dict)


class CdsDiscoveryResponse(BaseModel):
    services: list[CdsServiceDescriptor]


# --- patient-view request ---------------------------------------------------


class PatientViewContext(BaseModel):
    userId: str
    patientId: str
    encounterId: str | None = None


class CdsHookRequest(BaseModel):
    hookInstance: str
    hook: Literal["patient-view"]
    fhirServer: str | None = None
    context: PatientViewContext
    prefetch: dict[str, Any] = Field(default_factory=dict)


# --- patient-view response (cards) ------------------------------------------


class CardSource(BaseModel):
    label: str
    url: str | None = None
    icon: str | None = None


class SuggestionAction(BaseModel):
    type: Literal["create", "update", "delete"]
    description: str
    resource: dict[str, Any] | None = None


class Suggestion(BaseModel):
    label: str
    uuid: str = Field(default_factory=lambda: str(uuid4()))
    actions: list[SuggestionAction] = Field(default_factory=list)


class Card(BaseModel):
    uuid: str = Field(default_factory=lambda: str(uuid4()))
    summary: str = Field(..., max_length=140)
    indicator: Literal["info", "warning", "critical"]
    detail: str
    source: CardSource
    suggestions: list[Suggestion] = Field(default_factory=list)


class CdsHookResponse(BaseModel):
    cards: list[Card]
