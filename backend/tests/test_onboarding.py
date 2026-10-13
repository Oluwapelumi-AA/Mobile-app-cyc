from types import SimpleNamespace

import pytest

from app.schemas.onboarding import OnboardingStep, StepStatus
from app.services.onboarding import (
    OnboardingAlreadyCompleted,
    OnboardingProgress,
    InvalidStepTransition,
    RequiredStepNotSkippable,
    RequiredStepsIncomplete,
    StepRequirementNotMet,
)


def make_profile(**overrides):
    values = dict(
        display_name="Grace",
        avatar_url=None,
        language_code=None,
        country_code=None,
        timezone=None,
    )
    values.update(overrides)
    return SimpleNamespace(**values)


def test_new_progress_has_all_steps_pending():
    status = OnboardingProgress().to_read()

    assert [s.status for s in status.steps] == [StepStatus.PENDING] * len(OnboardingStep)
    assert status.next_step == OnboardingStep.PROFILE_BASICS
    assert status.required_remaining == [OnboardingStep.PROFILE_BASICS, OnboardingStep.LANGUAGE]
    assert status.can_complete is False
    assert status.is_complete is False


def test_required_flags():
    required = {s.step for s in OnboardingProgress().to_read().steps if s.required}

    assert required == {OnboardingStep.PROFILE_BASICS, OnboardingStep.LANGUAGE}


def test_step_requires_profile_data():
    progress = OnboardingProgress()

    with pytest.raises(StepRequirementNotMet):
        progress.complete_step(OnboardingStep.LANGUAGE, make_profile())
    with pytest.raises(StepRequirementNotMet):
        progress.complete_step(OnboardingStep.AVATAR, make_profile())

    progress.complete_step(OnboardingStep.LANGUAGE, make_profile(language_code="en"))
    assert progress.steps[OnboardingStep.LANGUAGE] is StepStatus.COMPLETED


def test_communities_step_needs_no_profile_field():
    progress = OnboardingProgress()
    progress.complete_step(OnboardingStep.COMMUNITIES, make_profile())

    assert progress.steps[OnboardingStep.COMMUNITIES] is StepStatus.COMPLETED


@pytest.mark.parametrize("step", [OnboardingStep.PROFILE_BASICS, OnboardingStep.LANGUAGE])
def test_required_steps_cannot_be_skipped(step):
    with pytest.raises(RequiredStepNotSkippable):
        OnboardingProgress().skip_step(step)


def test_skipped_step_can_be_completed_later():
    progress = OnboardingProgress()
    progress.skip_step(OnboardingStep.AVATAR)
    progress.complete_step(OnboardingStep.AVATAR, make_profile(avatar_url="https://cdn/a.jpg"))

    assert progress.steps[OnboardingStep.AVATAR] is StepStatus.COMPLETED


def test_completed_step_cannot_be_skipped():
    progress = OnboardingProgress()
    progress.complete_step(OnboardingStep.TIMEZONE, make_profile(timezone="Africa/Lagos"))

    with pytest.raises(InvalidStepTransition):
        progress.skip_step(OnboardingStep.TIMEZONE)


def test_cannot_complete_onboarding_with_required_steps_missing():
    progress = OnboardingProgress()
    progress.complete_step(OnboardingStep.PROFILE_BASICS, make_profile())

    with pytest.raises(RequiredStepsIncomplete):
        progress.complete()
    assert progress.is_complete is False


def test_complete_onboarding_skips_pending_optional_steps():
    profile = make_profile(language_code="yo", country_code="NG")
    progress = OnboardingProgress()
    progress.complete_step(OnboardingStep.PROFILE_BASICS, profile)
    progress.complete_step(OnboardingStep.LANGUAGE, profile)
    progress.complete_step(OnboardingStep.REGION, profile)
    assert progress.to_read().can_complete is True

    progress.complete()
    status = progress.to_read()

    assert status.is_complete is True
    assert status.completed_at is not None
    assert status.next_step is None
    assert status.can_complete is False
    assert progress.steps[OnboardingStep.REGION] is StepStatus.COMPLETED
    assert progress.steps[OnboardingStep.AVATAR] is StepStatus.SKIPPED
    assert progress.steps[OnboardingStep.COMMUNITIES] is StepStatus.SKIPPED


def test_no_changes_after_completion():
    profile = make_profile(language_code="en", timezone="UTC")
    progress = OnboardingProgress()
    progress.complete_step(OnboardingStep.PROFILE_BASICS, profile)
    progress.complete_step(OnboardingStep.LANGUAGE, profile)
    progress.complete()

    with pytest.raises(OnboardingAlreadyCompleted):
        progress.complete_step(OnboardingStep.TIMEZONE, profile)
    with pytest.raises(OnboardingAlreadyCompleted):
        progress.skip_step(OnboardingStep.AVATAR)
    with pytest.raises(OnboardingAlreadyCompleted):
        progress.complete()


def test_next_step_follows_order():
    progress = OnboardingProgress()
    progress.complete_step(OnboardingStep.PROFILE_BASICS, make_profile())
    progress.skip_step(OnboardingStep.AVATAR)

    assert progress.to_read().next_step == OnboardingStep.LANGUAGE
