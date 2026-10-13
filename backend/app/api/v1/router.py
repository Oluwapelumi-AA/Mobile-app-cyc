from fastapi import APIRouter

from app.api.v1 import onboarding, profiles

api_router = APIRouter()
api_router.include_router(profiles.router)
api_router.include_router(onboarding.router)
