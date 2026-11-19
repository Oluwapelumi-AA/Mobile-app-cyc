from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import router as api_v1_router
from app.core.config import settings
from app.services.errors import DomainError

app = FastAPI(
    title="The Light App API",
    description="Backend API for the CYC Christian community platform.",
    version="0.1.0",
)

# Browsers only (the phone app doesn't need this): lets the Expo web preview
# and other browser front ends listed in CORS_ORIGINS call the API.
if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "Accept"],
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
    return {
        "message": "Welcome to The Light App API",
        "docs": "/docs",
    }


@app.get("/health", tags=["Health"])
async def health_check():
    """Return the API health status."""
    return {
        "status": "healthy",
        "service": "the-light-app-api",
        "version": "0.1.0",
    }
