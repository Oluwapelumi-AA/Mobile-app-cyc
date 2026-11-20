"""Security headers and request size limits for every response."""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import settings

_DOCS_PATHS = ("/docs", "/redoc", "/openapi.json")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        length = request.headers.get("content-length")
        if length and length.isdigit() and int(length) > settings.max_request_bytes:
            return JSONResponse(
                status_code=413,
                content={"detail": {"code": "request_too_large", "message": "That request is too large."}},
            )
        response = await call_next(request)
        headers = response.headers
        headers.setdefault("X-Content-Type-Options", "nosniff")
        headers.setdefault("X-Frame-Options", "DENY")
        headers.setdefault("Referrer-Policy", "no-referrer")
        headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
        headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        headers.setdefault("Cross-Origin-Resource-Policy", "same-site")
        if not request.url.path.startswith(_DOCS_PATHS):
            # The API only returns JSON: nothing may load or frame it.
            headers.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
        if request.url.path.startswith(f"{settings.api_v1_prefix}/auth"):
            headers["Cache-Control"] = "no-store"
        if settings.is_production:
            headers.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
        return response
