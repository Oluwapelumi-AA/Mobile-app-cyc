
"""Shared per-IP request limits for abuse-prone endpoints.

Production uses Redis-compatible storage (Render Valkey).
Local development and tests use in-memory storage.
"""

from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.core.config import settings


# Use shared Redis-compatible storage when configured.
# Otherwise, use in-memory storage for local development and tests.
storage_uri = settings.redis_url or "memory://"

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=storage_uri,
    enabled=settings.rate_limit_enabled,
    headers_enabled=False,
)


def rate_limited(
    request: Request,
    exc: RateLimitExceeded,
) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={
            "detail": {
                "code": "too_many_requests",
                "message": "Too many attempts. Please wait a minute and try again.",
            }
        },
        headers={"Retry-After": "60"},
    )
