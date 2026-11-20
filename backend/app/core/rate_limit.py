"""Per-IP request limits for sign-in and other abuse-prone endpoints.

Limits live in memory, per API process. Behind a proxy or load balancer,
run uvicorn with ``--proxy-headers --forwarded-allow-ips=<proxy IP>`` so the
client's real IP is used.
"""

from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.core.config import settings

limiter = Limiter(key_func=get_remote_address, enabled=settings.rate_limit_enabled, headers_enabled=False)


def rate_limited(request: Request, exc: RateLimitExceeded) -> JSONResponse:
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
