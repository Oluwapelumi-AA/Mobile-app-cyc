import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import Uuid

from app.db.session import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ReportTarget(str, Enum):
    POST = "post"
    COMMENT = "comment"
    USER = "user"
    COMMUNITY = "community"
    EVENT = "event"
    RESOURCE = "resource"


class ReportReason(str, Enum):
    SPAM = "spam"
    HARASSMENT = "harassment"
    HATE = "hate"
    VIOLENCE = "violence"
    SEXUAL_CONTENT = "sexual_content"
    SELF_HARM = "self_harm"
    MISINFORMATION = "misinformation"
    IMPERSONATION = "impersonation"
    OTHER = "other"


class ReportStatus(str, Enum):
    OPEN = "open"
    # Reviewed and something was done (e.g. the content was removed).
    ACTIONED = "actioned"
    # Reviewed and nothing breaks the guidelines.
    DISMISSED = "dismissed"


def _values(enum_cls) -> str:
    return ", ".join(f"'{item.value}'" for item in enum_cls)


class ContentReport(Base):
    __tablename__ = "content_reports"

    __table_args__ = (
        CheckConstraint(
            f"target_type IN ({_values(ReportTarget)})",
            name="ck_content_reports_target_type",
        ),
        CheckConstraint(
            f"reason IN ({_values(ReportReason)})",
            name="ck_content_reports_reason",
        ),
        CheckConstraint(
            f"status IN ({_values(ReportStatus)})",
            name="ck_content_reports_status",
        ),
        # One report per person per thing; reporting again reopens it.
        UniqueConstraint(
            "reporter_id",
            "target_type",
            "target_id",
            name="uq_content_reports_reporter_target",
        ),
        # The moderation queue: oldest open first.
        Index("ix_content_reports_status_created", "status", "created_at", "id"),
        Index("ix_content_reports_community_status", "community_id", "status"),
        Index("ix_content_reports_target", "target_type", "target_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    reporter_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    target_type: Mapped[str] = mapped_column(String(20), nullable=False)
    # No foreign key: the reported thing may be deleted, the report stays.
    target_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    # Whoever wrote or owns the reported thing (the user, for user reports).
    target_owner_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # The community whose moderators review it. Null means app moderators
    # (users, communities themselves, and app-wide events and resources).
    community_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("communities.id", ondelete="SET NULL"),
        nullable=True,
    )
    reason: Mapped[str] = mapped_column(String(20), nullable=False)
    details: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    # What the reported thing said when it was reported, in case it changes.
    snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(
        String(10),
        default=ReportStatus.OPEN.value,
        nullable=False,
    )
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    resolution_note: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    content_removed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
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


class CommunityBan(Base):
    """Someone removed from a community who may not join it again."""

    __tablename__ = "community_bans"

    __table_args__ = (
        UniqueConstraint(
            "community_id",
            "user_id",
            name="uq_community_bans_community_user",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    community_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("communities.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    banned_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )


class AuditLog(Base):
    """An append-only record of a moderation or admin action."""

    __tablename__ = "audit_logs"

    __table_args__ = (
        Index("ix_audit_logs_created", "created_at", "id"),
        Index("ix_audit_logs_community_created", "community_id", "created_at", "id"),
        Index("ix_audit_logs_target", "target_type", "target_id"),
        Index("ix_audit_logs_actor_created", "actor_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    # e.g. "post.removed", "user.suspended"; see app.services.audit.
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    target_type: Mapped[str] = mapped_column(String(20), nullable=False)
    # No foreign key: the log outlives what it is about.
    target_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    # Kept as a plain id (no foreign key) so a deleted community's log stays.
    community_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        nullable=True,
    )
    # Details such as the reason, the old and new role or removed text.
    data: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
