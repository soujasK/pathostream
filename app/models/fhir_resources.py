"""Purpose-built FHIR R4 Pydantic resource models.

SCOPE NOTE: this is intentionally NOT a general-purpose FHIR R4 library
(that would be thousands of fields across ~150 resource types). It models,
precisely and completely, the handful of FHIR R4 elements this project
actually emits: Coding / CodeableConcept / Quantity / Reference, and the
Observation, Location, RiskAssessment, Flag and Bundle resources used by
`app/core/fhir_compiler.py`. Every field present matches the FHIR R4
specification's JSON shape for that element; fields this project never
populates are simply omitted rather than stubbed out.

LOINC / SNOMED / UCUM code caveats: see README.md ("Code corrections") for
the terminology corrections applied here relative to the original
engineering spec.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class Coding(BaseModel):
    system: str
    code: str
    display: str | None = None


class CodeableConcept(BaseModel):
    coding: list[Coding]
    text: str | None = None


class Quantity(BaseModel):
    value: float
    unit: str
    system: str = "http://unitsofmeasure.org"
    code: str


class Reference(BaseModel):
    reference: str
    display: str | None = None


class Meta(BaseModel):
    profile: list[str] = Field(default_factory=list)


class ObservationResource(BaseModel):
    resourceType: Literal["Observation"] = "Observation"
    id: str | None = None
    meta: Meta | None = None
    status: Literal["final", "preliminary", "amended", "entered-in-error"] = "final"
    code: CodeableConcept
    subject: Reference | None = None
    focus: list[Reference] | None = None
    effectiveDateTime: str
    valueQuantity: Quantity | None = None
    valueString: str | None = None


class LocationPosition(BaseModel):
    longitude: float
    latitude: float


class LocationResource(BaseModel):
    resourceType: Literal["Location"] = "Location"
    id: str | None = None
    status: Literal["active", "suspended", "inactive"] = "active"
    name: str
    description: str | None = None
    position: LocationPosition | None = None


class Period(BaseModel):
    start: str
    end: str


class RiskAssessmentPrediction(BaseModel):
    outcome: CodeableConcept
    qualitativeRisk: CodeableConcept | None = None
    probabilityDecimal: float | None = Field(default=None, ge=0, le=1)
    whenPeriod: Period | None = None
    rationale: str | None = None


class RiskAssessmentResource(BaseModel):
    resourceType: Literal["RiskAssessment"] = "RiskAssessment"
    id: str | None = None
    status: Literal["registered", "preliminary", "final", "amended"] = "final"
    subject: Reference
    occurrenceDateTime: str
    condition: Reference | None = None
    basis: list[Reference] = Field(default_factory=list)
    prediction: list[RiskAssessmentPrediction] = Field(default_factory=list)


class FlagResource(BaseModel):
    resourceType: Literal["Flag"] = "Flag"
    id: str | None = None
    status: Literal["active", "inactive", "entered-in-error"] = "active"
    category: list[CodeableConcept] = Field(default_factory=list)
    code: CodeableConcept
    subject: Reference
    period: dict[str, str] | None = None


BundleResourceType = (
    ObservationResource | LocationResource | RiskAssessmentResource | FlagResource
)


class BundleRequest(BaseModel):
    method: Literal["POST", "PUT"] = "POST"
    url: str


class BundleEntry(BaseModel):
    fullUrl: str
    resource: BundleResourceType
    request: BundleRequest


class BundleResource(BaseModel):
    resourceType: Literal["Bundle"] = "Bundle"
    type: Literal["transaction"] = "transaction"
    entry: list[BundleEntry]
