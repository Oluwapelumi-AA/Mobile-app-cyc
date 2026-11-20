from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api.v1.router import router as api_v1_router
from app.core.config import settings
from app.core.middleware import SecurityHeadersMiddleware
from app.core.rate_limit import limiter, rate_limited
from app.services.errors import DomainError

app = FastAPI(
    title="The Light App API",
    description="Backend API for the CYC Christian community platform.",
    version="0.1.0",
    # API docs are off in production unless ENABLE_DOCS=true.
    docs_url="/docs" if settings.docs_enabled else None,
    redoc_url="/redoc" if settings.docs_enabled else None,
    openapi_url="/openapi.json" if settings.docs_enabled else None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limited)

app.add_middleware(SecurityHeadersMiddleware)

if settings.allowed_hosts and settings.allowed_hosts != ["*"]:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)

# Browsers only (the phone app doesn't need this): lets the Expo web preview
# and other browser front ends listed in CORS_ORIGINS call the API.
if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "Accept"],
        max_age=600,
    )


@app.exception_handler(DomainError)
async def domain_error_handler(request: Request, exc: DomainError):
    # Same body shape as HTTPException(detail={"code", "message"}).
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": {"code": exc.code, "message": exc.message}},
    )


app.include_router(
    api_v1_router,
    prefix=settings.api_v1_prefix,
)


@app.get("/", tags=["Root"])
async def root():
    body = {"message": "Welcome to The Light App API"}
    if settings.docs_enabled:
        body["docs"] = "/docs"
    return body


@app.get("/health", tags=["Health"])
async def health_check():
    """Return the API health status."""
    return {
        "status": "healthy",
        "service": "the-light-app-api",
        "version": "0.1.0",
    }
