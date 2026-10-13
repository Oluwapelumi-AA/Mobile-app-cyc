from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel


class OnboardingStep(StrEnum):
    # Ordered as the app presents them. Account creation and sign-in come
    # before onboarding and are owned by the auth workstream.
    PROFILE_BASICS = "profile_basics"
    AVATAR = "avatar"
    LANGUAGE = "language"
    REGION = "region"
    TIMEZONE = "timezone"
    COMMUNITIES = "communities"


class StepStatus(StrEnum):
    PENDING = "pending"
    COMPLETED = "completed"
    SKIPPED = "skipped"


class OnboardingStepRead(BaseModel):
    step: OnboardingStep
    required: bool
    status: StepStatus


class OnboardingStatusRead(BaseModel):
    steps: list[OnboardingStepRead]
    next_step: OnboardingStep | None
    required_remaining: list[OnboardingStep]
    can_complete: bool
    is_complete: bool
    completed_at: datetime | None
