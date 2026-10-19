"""Request and response schemas for the spiritual resource library.

List endpoints return ``ResourceSummary`` (no article body); reading one
resource returns ``ResourceRead`` with the body and, for an uploaded file, a
short-lived ``file_url``.
"""

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import (
    AnyUrl,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    UrlConstraints,
)

from app.core.config import settings
from app.models.resource import ResourceKind, ResourceStatus
from app.schemas.common import UtcDatetime
from app.schemas.locale import LanguageCode

CategorySlug = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        to_lower=True,
        min_length=2,
        max_length=80,
        pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$",
    ),
]
CategoryName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=2, max_length=100)
]
CategoryDescription = Annotated[
    str, StringConstraints(strip_whitespace=True, max_length=500)
]
SortOrder = Annotated[int, Field(ge=-10_000, le=10_000)]

ResourceTitle = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=3, max_length=200)
]
ResourceSummaryText = Annotated[
    str, StringConstraints(strip_whitespace=True, max_length=500)
]
ResourceBody = Annotated[
    str, StringConstraints(strip_whitespace=True, max_length=100_000)
]
AuthorName = Annotated[
    str, StringConstraints(strip_whitespace=True, max_length=150)
]
ScriptureReference = Annotated[
    str, StringConstraints(strip_whitespace=True, max_length=200)
]
ResourceUrl = Annotated[
    AnyUrl, UrlConstraints(max_length=500, allowed_schemes=["http", "https"])
]
DurationSeconds = Annotated[int, Field(ge=1, le=7 * 24 * 3600)]

# File types accepted for each kind that can carry an upload.
FILE_CONTENT_TYPES: dict[ResourceKind, frozenset[str]] = {
    ResourceKind.AUDIO: frozenset(
        {"audio/mpeg", "audio/mp4", "audio/aac", "audio/ogg", "audio/wav"}
    ),
    ResourceKind.VIDEO: frozenset({"video/mp4", "video/webm", "video/quicktime"}),
    ResourceKind.DOCUMENT: frozenset({"application/pdf", "application/epub+zip"}),
}
ResourceContentType = Literal[
    "audio/mpeg",
    "audio/mp4",
    "audio/aac",
    "audio/ogg",
    "audio/wav",
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "application/pdf",
    "application/epub+zip",
]


# Categories


class CategoryCreate(BaseModel):
    """``slug`` is made from the name when it is left out."""

    model_config = ConfigDict(extra="forbid")

    name: CategoryName
    slug: CategorySlug | None = None
    description: CategoryDescription | None = None
    sort_order: SortOrder = 0


class CategoryUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: CategoryName | None = None
    slug: CategorySlug | None = None
    description: CategoryDescription | None = None
    sort_order: SortOrder | None = None


class CategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slug: str
    name: str
    description: str | None
    sort_order: int
    created_at: UtcDatetime
    updated_at: UtcDatetime


# Resources


class ResourceCreate(BaseModel):
    """A new resource starts as a draft. Publish it when it's ready."""

    model_config = ConfigDict(extra="forbid")

    # Leave out for the app-wide library (app moderators and admins only).
    community_id: UUID | None = None
    category_id: UUID | None = None
    kind: ResourceKind
    title: ResourceTitle
    summary: ResourceSummaryText | None = None
    body: ResourceBody | None = None
    author_name: AuthorName | None = None
    scripture_reference: ScriptureReference | None = None
    language: LanguageCode | None = None
    external_url: ResourceUrl | None = None
    duration_seconds: DurationSeconds | None = None


class ResourceUpdate(BaseModel):
    """Only the fields sent change. Send ``null`` to clear an optional one.

    ``kind`` can only change while no file is attached.
    """

    model_config = ConfigDict(extra="forbid")

    category_id: UUID | None = None
    kind: ResourceKind | None = None
    title: ResourceTitle | None = None
    summary: ResourceSummaryText | None = None
    body: ResourceBody | None = None
    author_name: AuthorName | None = None
    scripture_reference: ScriptureReference | None = None
    language: LanguageCode | None = None
    external_url: ResourceUrl | None = None
    duration_seconds: DurationSeconds | None = None


class ProgressRead(BaseModel):
    resource_id: UUID
    percent: int
    position_seconds: int | None
    completed: bool
    completed_at: UtcDatetime | None
    updated_at: UtcDatetime


class ResourceSummary(BaseModel):
    id: UUID
    community_id: UUID | None
    category_id: UUID | None
    created_by: UUID | None
    kind: ResourceKind
    status: ResourceStatus
    title: str
    summary: str | None
    author_name: str | None
    scripture_reference: str | None
    language: str | None
    external_url: str | None
    has_file: bool
    file_content_type: str | None
    file_size_bytes: int | None
    duration_seconds: int | None
    published_at: UtcDatetime | None
    bookmarked: bool
    my_progress: ProgressRead | None
    can_manage: bool
    created_at: UtcDatetime
    updated_at: UtcDatetime


class ResourceRead(ResourceSummary):
    body: str | None
    # A short-lived link to the uploaded file; null when there is none.
    file_url: str | None = None
    file_url_expires_at: datetime | None = None


class FileUploadRequest(BaseModel):
    """Declare the file before uploading it straight to storage."""

    model_config = ConfigDict(extra="forbid")

    content_type: ResourceContentType
    size_bytes: int = Field(gt=0, le=settings.resource_max_upload_bytes)


class FileUploadIntent(BaseModel):
    upload_url: str
    method: Literal["PUT", "POST"]
    headers: dict[str, str]
    object_key: str
    expires_at: datetime
    max_size_bytes: int


class FileConfirmRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    object_key: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)
    ]


class ProgressUpdate(BaseModel):
    """``completed: true`` is the same as ``percent: 100``."""

    model_config = ConfigDict(extra="forbid")

    percent: Annotated[int, Field(ge=0, le=100)] = 0
    position_seconds: Annotated[int, Field(ge=0, le=7 * 24 * 3600)] | None = None
    completed: bool = False


class BookmarkRead(BaseModel):
    resource_id: UUID
    bookmarked: bool
    created_at: UtcDatetime
