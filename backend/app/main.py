from fastapi import FastAPI

from app.api.v1.router import router as api_v1_router
from app.core.config import settings

app = FastAPI(
    title="The Light App API",
    description="Backend API for the CYC Christian community platform.",
    version="0.1.0",
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
