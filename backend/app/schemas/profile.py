"""Request and response schemas for user profiles.

Profile data is kept apart from identity and authentication data (email,
password hash, account status, roles), which belong to the shared User record
owned by the auth workstream.
"""

import unicodedata
import uuid
from datetime import datetime
from typing import Annotated, Self

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    StringConstraints,
    model_validator,
)

from app.core.identity import UserId
from app.schemas.locale import CountryCode, LanguageCode, TimeZoneId

DISPLAY_NAME_MAX_LENGTH = 50
BIO_MAX_LENGTH = 300


def _reject_control_characters(value: str, allowed: str = "") -> str:
    # Reject control/format characters such as NUL or bidi overrides that can
    # be abused to spoof names.
    for char in value:
        if char not in allowed and unicodedata.category(char) in {"Cc", "Cf"}:
            raise ValueError("must not contain control characters")
    return value


def _reject_control_characters_except_newline(value: str) -> str:
    return _reject_control_characters(value, allowed="\n")


def _empty_to_none(value: str | None) -> str | None:
    return value or None


DisplayName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=DISPLAY_NAME_MAX_LENGTH),
    AfterValidator(_reject_control_characters),
]
Bio = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=BIO_MAX_LENGTH),
    AfterValidator(_reject_control_characters_except_newline),
]


class ProfileCreate(BaseModel):
    """Initializes the current user's profile (onboarding: basic information)."""

    model_config = ConfigDict(extra="forbid")

    display_name: DisplayName
    bio: Annotated[Bio | None, AfterValidator(_empty_to_none)] = None
    language_code: LanguageCode | None = None
    country_code: CountryCode | None = None
    timezone: TimeZoneId | None = None


class ProfileUpdate(BaseModel):
    """Partial update. Omitted fields are left unchanged.

    ``bio``, ``country_code`` and ``timezone`` may be set to null to clear
    them. ``display_name`` and ``language_code`` may be changed but not
    cleared. ``avatar_url`` is not accepted here; it is only set through the
    avatar upload flow.
    """

    model_config = ConfigDict(extra="forbid")

    display_name: DisplayName | None = None
    bio: Annotated[Bio | None, AfterValidator(_empty_to_none)] = None
    language_code: LanguageCode | None = None
    country_code: CountryCode | None = None
    timezone: TimeZoneId | None = None

    @model_validator(mode="after")
    def _check_fields(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("at least one field must be provided")
        for field in ("display_name", "language_code"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be cleared")
        return self


class ProfileRead(BaseModel):
    user_id: UserId
    display_name: str
    bio: str | None
    avatar_url: str | None
    language_code: str | None
    country_code: str | None
    timezone: str | None
    branch_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime
