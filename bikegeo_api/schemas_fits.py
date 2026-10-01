from __future__ import annotations

import re
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

# Must match `MetricId` in web/src/fitMetrics.ts.
METRIC_IDS = frozenset(
    {
        "knee_ext_bdc",
        "knee_flex_tdc",
        "hip",
        "trunk",
        "shoulder",
        "elbow_flex",
        "kops",
        "saddle_height",
        "setback",
        "drop",
        "reach",
    }
)

_BAD_CHARS = re.compile(r"[<>&`\x00]")

FitName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


def _safe(v: str) -> str:
    if _BAD_CHARS.search(v):
        raise ValueError("contains_disallowed_characters")
    return v


class SnapPoint(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Annotated[str, StringConstraints(min_length=1, max_length=40)]
    pos: tuple[float, float, float]


class FitSnapshot(BaseModel):
    """What comparison needs without recomputing: metric values, the mannequin's points, components."""

    model_config = ConfigDict(extra="forbid")

    metrics: dict[str, float] = Field(default_factory=dict, max_length=len(METRIC_IDS))
    mannequin_points: list[SnapPoint] = Field(default_factory=list, max_length=64)
    components: dict[str, float | None] = Field(default_factory=dict, max_length=64)
    frame_label: Annotated[str, StringConstraints(max_length=200)] | None = None

    @field_validator("metrics")
    @classmethod
    def _metric_keys(cls, v: dict[str, float]) -> dict[str, float]:
        unknown = set(v) - METRIC_IDS
        if unknown:
            raise ValueError(f"unknown_metric_ids: {sorted(unknown)}")
        return v

    @field_validator("components")
    @classmethod
    def _component_keys(cls, v: dict[str, float | None]) -> dict[str, float | None]:
        for k in v:
            _safe(k)
            if len(k) > 60:
                raise ValueError("component_key_too_long")
        return v

    @field_validator("frame_label")
    @classmethod
    def _label(cls, v: str | None) -> str | None:
        return _safe(v) if v is not None else v


class FitIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: FitName
    # Builder state to restore the fit. Free-form (the client owns its shape, versioned by `inputs.v`)
    # but bounded: the 64 KB request cap applies, and at most 64 top-level keys.
    inputs: dict = Field(max_length=64)
    snapshot: FitSnapshot

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        return _safe(v)


class FitRename(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: FitName

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        return _safe(v)


class FitSummary(BaseModel):
    id: str
    name: str
    created_at: datetime
    metrics: dict[str, float]
    frame_label: str | None = None


class FitOut(FitSummary):
    schema_version: int
    inputs: dict
    snapshot: FitSnapshot


class FitsListResponse(BaseModel):
    fits: list[FitSummary]
