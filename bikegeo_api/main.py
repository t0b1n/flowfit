from __future__ import annotations

from fastapi import FastAPI

from bikegeo_core.geometry import synthesize_bike
from bikegeo_core.geometry_export import build_export
from bikegeo_core.solver import solve_setup

from .schemas import Geometry3DEdge, Geometry3DPoint, Geometry3DResponse, SolveRequest, SolveResponse

app = FastAPI(title="Bikegeo API", version="0.1.0")


@app.post("/solve", response_model=SolveResponse)
def solve(request: SolveRequest) -> SolveResponse:
    result = solve_setup(request.setup)
    return SolveResponse(result=result)


@app.post("/geometry3d", response_model=Geometry3DResponse)
def geometry3d(request: SolveRequest) -> Geometry3DResponse:
    result = solve_setup(request.setup)
    bike_pts = synthesize_bike(result.frame, result.components)
    export = build_export(result, bike_pts)
    return Geometry3DResponse(
        version=export.version,
        points=[
            Geometry3DPoint(name=p.name, pos=[p.pos.x, p.pos.y, p.pos.z], group=p.group)
            for p in export.points
        ],
        edges=[
            Geometry3DEdge(a=e.a, b=e.b, group=e.group)
            for e in export.edges
        ],
        pose_metrics=export.pose_metrics,
        frame=export.frame,
        components=export.components,
        rider=export.rider,
        constraints=export.constraints,
    )

