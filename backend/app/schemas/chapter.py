
"""Request and response schemas for CYC Chapters."""

from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, StringConstraints

from app.schemas.common import UtcDatetime
from app.schemas.locale import CountryCode, LanguageCode, TimeZoneId

ChapterName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=2, max_length=100),
]

ChapterSlug = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        to_lower=True,
        min_length=2,
        max_length=80,
        pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$",
    ),
]

ChapterDescription = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=1000),
]

ChapterCity = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=100),
]


class ChapterCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: ChapterName
    slug: ChapterSlug | None = None
    description: ChapterDescription | None = None
    country_code: CountryCode
    city: ChapterCity | None = None
    timezone: TimeZoneId
    language_code: LanguageCode | None = None
    contact_email: EmailStr | None = None


class ChapterUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: ChapterName | None = None
    slug: ChapterSlug | None = None
    description: ChapterDescription | None = None
    country_code: CountryCode | None = None
    city: ChapterCity | None = None
    timezone: TimeZoneId | None = None
    language_code: LanguageCode | None = None
    contact_email: EmailStr | None = None


class ChapterRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

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
    is_mine: bool
    created_at: UtcDatetime
    updated_at: UtcDatetime
