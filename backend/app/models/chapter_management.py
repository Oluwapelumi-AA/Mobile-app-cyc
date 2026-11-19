"""Chapter staff (Coordinators and Moderators) and platform-wide departments."""

import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import Uuid

from app.db.session import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ChapterStaffRole(str, Enum):
    """Roles a platform Admin can give someone inside one Chapter.

    - coordinator: runs the Chapter (events, meetings, announcements, access
      requests) and moderates it (reports, posts and comments, bans). One per
      Chapter. Resources and courses are managed by platform admins.
    """

    COORDINATOR = "coordinator"


class ChapterStaff(Base):
    __tablename__ = "chapter_staff"
    __table_args__ = (
        CheckConstraint(
            "role = 'coordinator'",
            name="ck_chapter_staff_role",
        ),
        # Someone holds at most one staff role in a Chapter.
        UniqueConstraint("chapter_id", "user_id", name="uq_chapter_staff_chapter_user"),
        # One Coordinator per Chapter.
        Index(
            "uq_chapter_staff_one_coordinator",
            "chapter_id",
            unique=True,
            sqlite_where=text("role = 'coordinator'"),
            postgresql_where=text("role = 'coordinator'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    chapter_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("chapters.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(
        String(20),
        default=ChapterStaffRole.COORDINATOR.value,
        nullable=False,
    )
    assigned_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )


class Department(Base):
    __tablename__ = "departments"
    __table_args__ = (
        UniqueConstraint("name", name="uq_departments_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
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
