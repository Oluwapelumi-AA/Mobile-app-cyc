"""Onboarding progress rules.

Required steps: ``profile_basics`` (a display name) and ``language`` (the app
needs one to choose UI and content; clients can prefill it from the device
locale). Every other step is optional and can be skipped, so users are never
forced to share a photo, their country or their time zone.

Rules:
- A step can be completed only when the profile holds the data it collects.
- Required steps cannot be skipped.
- A skipped optional step can be completed later; a completed step cannot be
  changed back to skipped.
- Onboarding can be completed once every required step is completed. Optional
  steps still pending at that point are marked skipped.
- Once onboarding is complete, step changes are rejected. Profile edits keep
  working through the profile endpoints.
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Protocol

from app.schemas.onboarding import (
    OnboardingStatusRead,
    OnboardingStep,
    OnboardingStepRead,
    StepStatus,
)

REQUIRED_STEPS = frozenset({OnboardingStep.PROFILE_BASICS, OnboardingStep.LANGUAGE})

# Profile field each step collects. Community selection has no profile field;
# it will be checked against memberships once communities exist.
_STEP_FIELDS: dict[OnboardingStep, str | None] = {
    OnboardingStep.PROFILE_BASICS: "display_name",
    OnboardingStep.AVATAR: "avatar_url",
    OnboardingStep.LANGUAGE: "language_code",
    OnboardingStep.REGION: "country_code",
    OnboardingStep.TIMEZONE: "timezone",
    OnboardingStep.COMMUNITIES: None,
}


class OnboardingError(Exception):
    code = "onboarding_error"


class OnboardingAlreadyCompleted(OnboardingError):
    code = "onboarding_already_completed"


class RequiredStepNotSkippable(OnboardingError):
    code = "required_step_not_skippable"


class StepRequirementNotMet(OnboardingError):
    code = "step_requirement_not_met"


class InvalidStepTransition(OnboardingError):
    code = "invalid_step_transition"


class RequiredStepsIncomplete(OnboardingError):
    code = "required_steps_incomplete"


class ProfileData(Protocol):
    display_name: str
    avatar_url: str | None
    language_code: str | None
    country_code: str | None
    timezone: str | None


def _initial_steps() -> dict[OnboardingStep, StepStatus]:
    return {step: StepStatus.PENDING for step in OnboardingStep}


@dataclass
class OnboardingProgress:
    steps: dict[OnboardingStep, StepStatus] = field(default_factory=_initial_steps)
    completed_at: datetime | None = None

    @property
    def is_complete(self) -> bool:
        return self.completed_at is not None

    @property
    def required_remaining(self) -> list[OnboardingStep]:
        return [
            step
            for step in OnboardingStep
            if step in REQUIRED_STEPS and self.steps[step] is not StepStatus.COMPLETED
        ]

    def _ensure_open(self) -> None:
        if self.is_complete:
            raise OnboardingAlreadyCompleted("onboarding is already complete")

    def complete_step(self, step: OnboardingStep, profile: ProfileData) -> None:
        self._ensure_open()
        profile_field = _STEP_FIELDS[step]
        if profile_field is not None and not getattr(profile, profile_field):
            raise StepRequirementNotMet(
                f"set {profile_field} on the profile before completing '{step}'"
            )
        self.steps[step] = StepStatus.COMPLETED

    def skip_step(self, step: OnboardingStep) -> None:
        self._ensure_open()
        if step in REQUIRED_STEPS:
            raise RequiredStepNotSkippable(f"'{step}' is required and cannot be skipped")
        if self.steps[step] is StepStatus.COMPLETED:
            raise InvalidStepTransition(f"'{step}' is already completed")
        self.steps[step] = StepStatus.SKIPPED

    def complete(self, now: datetime | None = None) -> None:
        self._ensure_open()
        missing = self.required_remaining
        if missing:
            raise RequiredStepsIncomplete(
                "complete required steps first: " + ", ".join(missing)
            )
        for step, status in self.steps.items():
            if status is StepStatus.PENDING:
                self.steps[step] = StepStatus.SKIPPED
        self.completed_at = now or datetime.now(UTC)

    def to_read(self) -> OnboardingStatusRead:
        pending = [s for s in OnboardingStep if self.steps[s] is StepStatus.PENDING]
        return OnboardingStatusRead(
            steps=[
                OnboardingStepRead(step=s, required=s in REQUIRED_STEPS, status=self.steps[s])
                for s in OnboardingStep
            ],
            next_step=None if self.is_complete or not pending else pending[0],
            required_remaining=self.required_remaining,
            can_complete=not self.is_complete and not self.required_remaining,
            is_complete=self.is_complete,
            completed_at=self.completed_at,
        )
