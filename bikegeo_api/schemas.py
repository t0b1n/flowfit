from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from bikegeo_core.models import SetupInput, SetupOutput


class SolveRequest(BaseModel):
    setup: SetupInput


class SolveResponse(BaseModel):
    result: SetupOutput


class Geometry3DPoint(BaseModel):
    name: str
    pos: list[float]
    group: str


class Geometry3DEdge(BaseModel):
    a: str
    b: str
    group: str


class Geometry3DResponse(BaseModel):
    version: str
    points: list[Geometry3DPoint]
    edges: list[Geometry3DEdge]
    pose_metrics: dict[str, float]
    frame: dict[str, float]
    components: dict[str, Any]
    rider: dict[str, Any]
    constraints: dict[str, Any]

