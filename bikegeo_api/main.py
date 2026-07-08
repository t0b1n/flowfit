from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from bikegeo_core.solver import solve_setup

from .db import init_db
from .middleware import RequestSizeLimitMiddleware, StrictJsonContentTypeMiddleware
from .routers import auth as auth_router
from .routers import bikes as bikes_router
from .schemas import SolveRequest, SolveResponse


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Bikegeo API", version="0.1.0", lifespan=lifespan)
app.add_middleware(RequestSizeLimitMiddleware, max_bytes=64 * 1024)
app.add_middleware(StrictJsonContentTypeMiddleware)
app.include_router(auth_router.router)
app.include_router(bikes_router.router)


@app.post("/solve", response_model=SolveResponse)
def solve(request: SolveRequest) -> SolveResponse:
    result = solve_setup(request.setup)
    return SolveResponse(result=result)
