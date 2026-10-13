"""Profile storage boundary.

``InMemoryProfileRepository`` is a stand-in until the UserProfile table is
agreed with the auth workstream (see docs/profile-onboarding.md). Data held
in it is lost on restart; it must be replaced by a database-backed
repository before release.
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime
from threading import Lock
from typing import Protocol

from app.core.identity import UserId
from app.schemas.profile import ProfileCreate, ProfileRead, ProfileUpdate
from app.services.onboarding import OnboardingProgress


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


class InMemoryProfileRepository:
    def __init__(self) -> None:
        self._records: dict[UserId, ProfileRecord] = {}
        self._lock = Lock()

    def get(self, user_id: UserId) -> ProfileRecord | None:
        return self._records.get(user_id)

    def add(self, record: ProfileRecord) -> None:
        with self._lock:
            if record.user_id in self._records:
                raise ProfileAlreadyExists(str(record.user_id))
            self._records[record.user_id] = record

    def save(self, record: ProfileRecord) -> None:
        with self._lock:
            self._records[record.user_id] = record
