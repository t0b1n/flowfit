from __future__ import annotations

import re
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, StringConstraints, field_validator

# String fields run through this regex to reject characters that could lead
# to HTML/script injection if a row is ever rendered without escaping.
_BAD_CHARS = re.compile(r"[<>&`\x00]")

SafeStr = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=200),
]


def _check_safe_str(v: str) -> str:
    if _BAD_CHARS.search(v):
        raise ValueError("contains_disallowed_characters")
    return v


class FrameGeometryIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_max_length=200)

    stack: float = Field(ge=200, le=900)
    reach: float = Field(ge=200, le=600)
    head_angle_deg: float = Field(ge=50, le=90)
    seat_angle_deg: float = Field(ge=50, le=90)
    bb_drop: float = Field(ge=-100, le=150)
    chainstay_length: float = Field(ge=350, le=550)
    fork_length: float = Field(ge=300, le=700)
    fork_offset: float = Field(ge=0, le=100)
    wheel_radius: float = Field(ge=200, le=400)
    wheelbase: float | None = Field(default=None, ge=800, le=1400)
    seat_tube_ct: float | None = Field(default=None, ge=300, le=800)
    head_tube: float | None = Field(default=None, ge=50, le=400)
    top_tube_effective: float | None = Field(default=None, ge=400, le=700)


class StockCockpitIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_max_length=200)

    stem_length: float | None = Field(default=None, ge=30, le=200)
    bar_width: float | None = Field(default=None, ge=300, le=520)
    crank_length: float | None = Field(default=None, ge=140, le=200)
    spacer_stack: float | None = Field(default=None, ge=0, le=80)


class SizeDataIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_max_length=200)

    size: SafeStr
    geometry: FrameGeometryIn
    wheelbase: float | None = Field(default=None, ge=800, le=1400)
    front_center: float | None = Field(default=None, ge=400, le=900)
    trail: float | None = Field(default=None, ge=30, le=120)
    top_tube_effective: float | None = Field(default=None, ge=400, le=700)
    standover: float | None = Field(default=None, ge=500, le=950)
    bb_height: float | None = Field(default=None, ge=200, le=400)
    seat_tube_ct: float | None = Field(default=None, ge=300, le=800)
    head_tube: float | None = Field(default=None, ge=50, le=400)
    stockCockpit: StockCockpitIn | None = None

    @field_validator("size")
    @classmethod
    def _safe_size(cls, v: str) -> str:
        return _check_safe_str(v)


class FrameModelIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_max_length=200)

    brand: SafeStr
    model: SafeStr
    launch_year: int = Field(ge=1950, le=2100)
    category: SafeStr
    popularity: SafeStr
    sources: list[HttpUrl] = Field(default_factory=list, max_length=10)
    sizes: list[SizeDataIn] = Field(min_length=1, max_length=20)

    @field_validator("brand", "model", "category", "popularity")
    @classmethod
    def _safe_str(cls, v: str) -> str:
        return _check_safe_str(v)

    @field_validator("sources")
    @classmethod
    def _https_only(cls, urls: list[HttpUrl]) -> list[HttpUrl]:
        for u in urls:
            if u.scheme != "https":
                raise ValueError("source_must_be_https")
        return urls


class FlagRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str = Field(min_length=10, max_length=500)


class FrameModelOut(FrameModelIn):
    """Same shape as input plus identity / metadata fields for the catalog."""

    id: str
    submitted_by_user_id: str


class BikesListResponse(BaseModel):
    bikes: list[FrameModelOut]


class BrandsResponse(BaseModel):
    brands: list[str]
