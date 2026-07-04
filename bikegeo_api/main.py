from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from bikegeo_core.geometry import synthesize_bike
from bikegeo_core.geometry_export import build_export
from bikegeo_core.solver import solve_setup

from .db import engine, init_db
from .middleware import RequestSizeLimitMiddleware, StrictJsonContentTypeMiddleware
from .routers import auth as auth_router
from .routers import bikes as bikes_router
from .schemas import Geometry3DEdge, Geometry3DPoint, Geometry3DResponse, SolveRequest, SolveResponse


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    try:
        yield
    finally:
        engine.dispose()


app = FastAPI(title="Bikegeo API", version="0.1.0", lifespan=lifespan)
app.add_middleware(RequestSizeLimitMiddleware, max_bytes=64 * 1024)
app.add_middleware(StrictJsonContentTypeMiddleware)
app.include_router(auth_router.router)
app.include_router(bikes_router.router)


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

