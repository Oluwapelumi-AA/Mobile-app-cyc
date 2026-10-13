
from fastapi import APIRouter

from app.api.v1.auth import router as auth_router

router = APIRouter()

router.include_router(auth_router)


@router.get("/health", tags=["Health"])
async def versioned_health_check():
    """Return the versioned API health status."""
    return {
        "status": "healthy",
        "service": "the-light-app-api",
        "version": "0.1.0",
    }
