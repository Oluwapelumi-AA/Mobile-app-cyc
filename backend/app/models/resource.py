import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import Uuid

from app.db.session import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ResourceKind(str, Enum):
    # Text read in the app (a devotional, a study, a sermon transcript).
    ARTICLE = "article"
    AUDIO = "audio"
    VIDEO = "video"
    # A PDF or EPUB, e.g. a book or a study guide.
    DOCUMENT = "document"
    # Somewhere else on the web.
    LINK = "link"


class ResourceStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"


class ResourceCategory(Base):
    __tablename__ = "resource_categories"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Lower comes first in the app's category list.
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )


class Resource(Base):
    __tablename__ = "resources"

    __table_args__ = (
        CheckConstraint(
            "kind IN ('article', 'audio', 'video', 'document', 'link')",
            name="ck_resources_kind",
        ),
        CheckConstraint(
            "status IN ('draft', 'published')",
            name="ck_resources_status",
        ),
        CheckConstraint(
            "duration_seconds IS NULL OR duration_seconds > 0",
            name="ck_resources_duration_positive",
        ),
        # The library: newest published first, ties broken by id.
        Index("ix_resources_status_published", "status", "published_at", "id"),
        Index(
            "ix_resources_community_status_published",
            "community_id",
            "status",
            "published_at",
            "id",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    # Null for the app-wide library curated by CYC itself.
    community_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("communities.id", ondelete="CASCADE"),
        nullable=True,
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("resource_categories.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    kind: Mapped[str] = mapped_column(String(10), nullable=False)
    status: Mapped[str] = mapped_column(
        String(10),
        default=ResourceStatus.DRAFT.value,
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    summary: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # The text of an article.
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Who wrote or spoke it, as shown to readers (not necessarily a user).
    author_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    # e.g. "John 3:16-21".
    scripture_reference: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # BCP 47 tag, e.g. "en" or "yo".
    language: Mapped[str | None] = mapped_column(String(35), nullable=True)
    external_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # An uploaded audio, video or document file in object storage.
    file_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )


class ResourceBookmark(Base):
    __tablename__ = "resource_bookmarks"

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "resource_id",
            name="uq_resource_bookmarks_user_resource",
        ),
        # A user's bookmarks, newest first.
        Index("ix_resource_bookmarks_user_created", "user_id", "created_at", "id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    resource_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("resources.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )


class ResourceProgress(Base):
    __tablename__ = "resource_progress"

    __table_args__ = (
        CheckConstraint(
            "percent >= 0 AND percent <= 100",
            name="ck_resource_progress_percent",
        ),
        CheckConstraint(
            "position_seconds IS NULL OR position_seconds >= 0",
            name="ck_resource_progress_position",
        ),
        UniqueConstraint(
            "user_id",
            "resource_id",
            name="uq_resource_progress_user_resource",
        ),
        # "Continue where you left off": most recently opened first.
        Index("ix_resource_progress_user_updated", "user_id", "updated_at", "id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    resource_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("resources.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    percent: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Where to resume audio or video.
    position_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Set the first time the user finishes; kept if they start again.
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )
