from __future__ import annotations

from pydantic import BaseModel

from bikegeo_core.models import SetupInput, SetupOutput


class SolveRequest(BaseModel):
    setup: SetupInput


class SolveResponse(BaseModel):
    result: SetupOutput
