from __future__ import annotations

import re

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response


WRITE_METHODS = {"POST", "PATCH", "PUT"}

# Match the bare JSON literals NaN / Infinity / -Infinity (which Python's
# json.loads accepts but the JSON spec forbids). Surrounded by JSON
# value-position characters so we don't false-match strings.
_NAN_INF_RE = re.compile(rb'(?:^|[\s,:\[])(-?Infinity|NaN)(?=[\s,\}\]])')


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, max_bytes: int = 64 * 1024) -> None:
        super().__init__(app)
        self.max_bytes = max_bytes

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.method in WRITE_METHODS:
            content_length = request.headers.get("content-length")
            if content_length is not None:
                try:
                    declared = int(content_length)
                except ValueError:
                    return JSONResponse({"detail": "invalid_content_length"}, status_code=400)
                if declared > self.max_bytes:
                    return JSONResponse({"detail": "payload_too_large"}, status_code=413)

            body = await request.body()
            if len(body) > self.max_bytes:
                return JSONResponse({"detail": "payload_too_large"}, status_code=413)

            ctype = request.headers.get("content-type", "").lower()
            if ctype.startswith("application/json") and _NAN_INF_RE.search(body):
                return JSONResponse({"detail": "invalid_json"}, status_code=400)

            async def receive():
                return {"type": "http.request", "body": body, "more_body": False}

            request._receive = receive  # type: ignore[attr-defined]

        return await call_next(request)


class StrictJsonContentTypeMiddleware(BaseHTTPMiddleware):
    """Reject non-JSON write requests on /auth and /bikes (excluding logout, which has no body)."""

    GUARDED_PREFIXES = ("/auth", "/bikes")

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.method in WRITE_METHODS and any(
            request.url.path.startswith(p) for p in self.GUARDED_PREFIXES
        ):
            content_length = request.headers.get("content-length")
            has_body = content_length not in (None, "0")
            if has_body:
                ctype = request.headers.get("content-type", "")
                if not ctype.lower().startswith("application/json"):
                    return JSONResponse({"detail": "unsupported_media_type"}, status_code=415)
        return await call_next(request)
