"""Request and response schemas for CYC branches."""

from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, StringConstraints

from app.schemas.common import UtcDatetime
from app.schemas.locale import CountryCode, LanguageCode, TimeZoneId

BranchName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=2, max_length=100)
]
BranchSlug = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        to_lower=True,
        min_length=2,
        max_length=80,
        pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$",
    ),
]
BranchDescription = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]
City = Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)]


class BranchCreate(BaseModel):
    """``slug`` is made from the name when it is left out."""

    model_config = ConfigDict(extra="forbid")

    name: BranchName
    slug: BranchSlug | None = None
    description: BranchDescription | None = None
    country_code: CountryCode
    city: City | None = None
    timezone: TimeZoneId
    language_code: LanguageCode | None = None
    contact_email: EmailStr | None = None


class BranchUpdate(BaseModel):
    """Partial update. ``description``, ``city``, ``language_code`` and
    ``contact_email`` can be cleared with null."""

    model_config = ConfigDict(extra="forbid")

    name: BranchName | None = None
    slug: BranchSlug | None = None
    description: BranchDescription | None = None
    country_code: CountryCode | None = None
    city: City | None = None
    timezone: TimeZoneId | None = None
    language_code: LanguageCode | None = None
    contact_email: EmailStr | None = None


class BranchRead(BaseModel):
    id: UUID
    slug: str
    name: str
    description: str | None
    country_code: str
    city: str | None
    timezone: str
    language_code: str | None
    contact_email: str | None
    is_active: bool
    member_count: int
    community_count: int
    # Whether this is the caller's home branch.
    is_mine: bool
    created_at: UtcDatetime
    updated_at: UtcDatetime
