from fastapi import APIRouter, status

from app.api.v1.profiles import CurrentUserId, Profiles, error, get_existing_profile
from app.schemas.onboarding import OnboardingStatusRead, OnboardingStep
from app.services.onboarding import (
    OnboardingAlreadyCompleted,
    OnboardingError,
    RequiredStepNotSkippable,
)

router = APIRouter(prefix="/onboarding", tags=["Onboarding"])


def onboarding_error(exc: OnboardingError):
    if isinstance(exc, (OnboardingAlreadyCompleted, RequiredStepNotSkippable)):
        code = status.HTTP_409_CONFLICT
    else:
        code = 422
    return error(code, exc.code, str(exc))


@router.get("/me", response_model=OnboardingStatusRead)
def get_my_onboarding(user_id: CurrentUserId, profiles: Profiles):
    return get_existing_profile(user_id, profiles).onboarding.to_read()


@router.post("/me/steps/{step}/complete", response_model=OnboardingStatusRead)
def complete_onboarding_step(step: OnboardingStep, user_id: CurrentUserId, profiles: Profiles):
    record = get_existing_profile(user_id, profiles)
    try:
        record.onboarding.complete_step(step, record)
    except OnboardingError as exc:
        raise onboarding_error(exc)
    profiles.save(record)
    return record.onboarding.to_read()


@router.post("/me/steps/{step}/skip", response_model=OnboardingStatusRead)
def skip_onboarding_step(step: OnboardingStep, user_id: CurrentUserId, profiles: Profiles):
    record = get_existing_profile(user_id, profiles)
    try:
        record.onboarding.skip_step(step)
    except OnboardingError as exc:
        raise onboarding_error(exc)
    profiles.save(record)
    return record.onboarding.to_read()


@router.post("/me/complete", response_model=OnboardingStatusRead)
def complete_onboarding(user_id: CurrentUserId, profiles: Profiles):
    record = get_existing_profile(user_id, profiles)
    try:
        record.onboarding.complete()
    except OnboardingError as exc:
        raise onboarding_error(exc)
    profiles.save(record)
    return record.onboarding.to_read()
