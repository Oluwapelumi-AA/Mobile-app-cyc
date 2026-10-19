"""Profile storage.

API code works with ``ProfileRecord``; ``SqlAlchemyProfileRepository`` maps it
to the ``user_profiles`` table.
"""

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Protocol

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.identity import UserId
from app.models.user_profile import UserProfile
from app.schemas.onboarding import OnboardingStep, StepStatus
from app.schemas.profile import ProfileCreate, ProfileRead, ProfileUpdate
from app.services.onboarding import OnboardingProgress

_PROFILE_FIELDS = (
    "display_name",
    "bio",
    "avatar_url",
    "language_code",
    "country_code",
    "timezone",
    "branch_id",
)


def _now() -> datetime:
    return datetime.now(UTC)


@dataclass
class ProfileRecord:
    user_id: UserId
    display_name: str
    bio: str | None = None
    avatar_url: str | None = None
    language_code: str | None = None
    country_code: str | None = None
    timezone: str | None = None
    # Set through PUT /branches/{id}/membership, not the profile endpoints.
    branch_id: uuid.UUID | None = None
    onboarding: OnboardingProgress = field(default_factory=OnboardingProgress)
    created_at: datetime = field(default_factory=_now)
    updated_at: datetime = field(default_factory=_now)

    @classmethod
    def from_create(cls, user_id: UserId, data: ProfileCreate) -> "ProfileRecord":
        return cls(user_id=user_id, **data.model_dump())

    def apply_update(self, data: ProfileUpdate) -> None:
        for name, value in data.model_dump(exclude_unset=True).items():
            setattr(self, name, value)
        self.touch()

    def touch(self) -> None:
        self.updated_at = _now()

    def to_read(self) -> ProfileRead:
        return ProfileRead.model_validate(self, from_attributes=True)


class ProfileAlreadyExists(Exception):
    pass


class ProfileRepository(Protocol):
    def get(self, user_id: UserId) -> ProfileRecord | None: ...

    def add(self, record: ProfileRecord) -> None: ...

    def save(self, record: ProfileRecord) -> None: ...


def _ensure_utc(value: datetime | None) -> datetime | None:
    # SQLite drops tzinfo on read; stored values are always UTC.
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def _steps_from_row(stored: dict[str, str]) -> dict[OnboardingStep, StepStatus]:
    # Steps added after a row was written start as pending.
    return {
        step: StepStatus(stored.get(step.value, StepStatus.PENDING))
        for step in OnboardingStep
    }


def _to_record(row: UserProfile) -> ProfileRecord:
    return ProfileRecord(
        user_id=row.user_id,
        **{name: getattr(row, name) for name in _PROFILE_FIELDS},
        onboarding=OnboardingProgress(
            steps=_steps_from_row(row.onboarding_steps),
            completed_at=_ensure_utc(row.onboarding_completed_at),
        ),
        created_at=_ensure_utc(row.created_at),
        updated_at=_ensure_utc(row.updated_at),
    )


def _copy_to_row(record: ProfileRecord, row: UserProfile) -> None:
    for name in _PROFILE_FIELDS:
        setattr(row, name, getattr(record, name))
    row.onboarding_steps = {
        step.value: status.value for step, status in record.onboarding.steps.items()
    }
    row.onboarding_completed_at = record.onboarding.completed_at
    row.updated_at = record.updated_at


class SqlAlchemyProfileRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, user_id: UserId) -> ProfileRecord | None:
        row = self.db.get(UserProfile, user_id)
        return _to_record(row) if row is not None else None

    def add(self, record: ProfileRecord) -> None:
        if self.db.get(UserProfile, record.user_id) is not None:
            raise ProfileAlreadyExists(str(record.user_id))
        row = UserProfile(user_id=record.user_id, created_at=record.created_at)
        _copy_to_row(record, row)
        self.db.add(row)
        try:
            self.db.commit()
        except IntegrityError:
            # A concurrent request created the profile first.
            self.db.rollback()
            raise ProfileAlreadyExists(str(record.user_id)) from None

    def save(self, record: ProfileRecord) -> None:
        row = self.db.get(UserProfile, record.user_id)
        if row is None:
            raise LookupError(f"profile {record.user_id} does not exist")
        _copy_to_row(record, row)
        self.db.commit()
