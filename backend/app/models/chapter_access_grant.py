
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import Uuid

from app.db.session import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ChapterAccessGrant(Base):
    """Controls a Guest's access to individually approved Chapter content."""

    __tablename__ = "chapter_access_grants"

    __table_args__ = (
        UniqueConstraint(
            "chapter_id",
            "user_id",
            name="uq_chapter_access_grant_user",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    chapter_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("branches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    granted_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )


class ChapterAccessGrantItem(Base):
    """An individually approved content item accessible to a Chapter Guest."""

    __tablename__ = "chapter_access_grant_items"

    __table_args__ = (
        CheckConstraint(
            """
            (
                CASE WHEN post_id IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN chapter_post_id IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN event_id IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN meeting_id IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN resource_id IS NOT NULL THEN 1 ELSE 0 END
            ) = 1
            """,
            name="ck_chapter_access_grant_item_exactly_one_target",
        ),
        UniqueConstraint(
            "grant_id",
            "post_id",
            name="uq_chapter_grant_post",
        ),
        UniqueConstraint(
            "grant_id",
            "chapter_post_id",
            name="uq_chapter_grant_chapter_post",
        ),
        UniqueConstraint(
            "grant_id",
            "event_id",
            name="uq_chapter_grant_event",
        ),
        UniqueConstraint(
            "grant_id",
            "meeting_id",
            name="uq_chapter_grant_meeting",
        ),
        UniqueConstraint(
            "grant_id",
            "resource_id",
            name="uq_chapter_grant_resource",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    grant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("chapter_access_grants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    post_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("posts.id", ondelete="CASCADE"),
        nullable=True,
    )

    chapter_post_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("chapter_posts.id", ondelete="CASCADE"),
        nullable=True,
    )

    event_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=True,
    )

    meeting_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("meetings.id", ondelete="CASCADE"),
        nullable=True,
    )

    resource_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("resources.id", ondelete="CASCADE"),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
