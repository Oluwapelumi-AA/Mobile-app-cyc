
from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1 import (
    communities,
    events,
    meetings,
    onboarding,
    posts,
    profiles,
    reactions,
    video_webhooks,
)

router = APIRouter()

router.include_router(auth_router)
router.include_router(profiles.router)
router.include_router(onboarding.router)
router.include_router(reactions.router)
router.include_router(communities.router)
router.include_router(posts.router)
router.include_router(events.router)
router.include_router(meetings.router)
router.include_router(video_webhooks.router)


@router.get("/health", tags=["Health"])
async def versioned_health_check():
    """Return the versioned API health status."""
    return {
        "status": "healthy",
        "service": "the-light-app-api",
        "version": "0.1.0",
    }
