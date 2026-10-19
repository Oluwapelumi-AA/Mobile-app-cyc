import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import (
    BigInteger,
    Boolean,
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


class MeetingKind(str, Enum):
    # Everyone can talk and share video.
    MEETING = "meeting"
    # Hosts broadcast, everyone else watches.
    LIVESTREAM = "livestream"


class MeetingStatus(str, Enum):
    SCHEDULED = "scheduled"
    LIVE = "live"
    ENDED = "ended"
    CANCELLED = "cancelled"


class RecordingStatus(str, Enum):
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class Meeting(Base):
    """A video meeting or livestream, optionally tied to a community event."""

    __tablename__ = "meetings"

    __table_args__ = (
        CheckConstraint(
            "kind IN ('meeting', 'livestream')",
            name="ck_meetings_kind",
        ),
        CheckConstraint(
            "status IN ('scheduled', 'live', 'ended', 'cancelled')",
            name="ck_meetings_status",
        ),
        UniqueConstraint("provider", "provider_room_id", name="uq_meetings_provider_room"),
        Index("ix_meetings_created", "created_at", "id"),
        Index("ix_meetings_community_created", "community_id", "created_at", "id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    # Null for app-wide meetings run by CYC itself.
    community_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("communities.id", ondelete="CASCADE"),
        nullable=True,
    )
    # Deleting the event keeps the meeting (and its replays) in the community.
    event_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("events.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    kind: Mapped[str] = mapped_column(String(10), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(10),
        default=MeetingStatus.SCHEDULED.value,
        nullable=False,
    )
    scheduled_start_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    recording_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Which provider's room this is, and its id there. Set when it goes live.
    provider: Mapped[str | None] = mapped_column(String(30), nullable=True)
    provider_room_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
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


class MeetingRecording(Base):
    """A replay of a meeting, written to object storage by the provider."""

    __tablename__ = "meeting_recordings"

    __table_args__ = (
        CheckConstraint(
            "status IN ('processing', 'ready', 'failed')",
            name="ck_meeting_recordings_status",
        ),
        UniqueConstraint(
            "provider",
            "provider_recording_id",
            name="uq_meeting_recordings_provider_recording",
        ),
        Index("ix_meeting_recordings_meeting_created", "meeting_id", "created_at", "id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    meeting_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("meetings.id", ondelete="CASCADE"),
        nullable=False,
    )
    provider: Mapped[str] = mapped_column(String(30), nullable=False)
    provider_recording_id: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str] = mapped_column(
        String(10),
        default=RecordingStatus.PROCESSING.value,
        nullable=False,
    )
    # Object key in our bucket; set once the file is ready.
    storage_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Hosts can hide a replay without deleting it.
    published: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
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


class VideoWebhookReceipt(Base):
    """Provider webhook ids already handled, so retries are applied once."""

    __tablename__ = "video_webhook_receipts"

    __table_args__ = (
        UniqueConstraint("provider", "event_id", name="uq_video_webhook_receipts_provider_event"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    provider: Mapped[str] = mapped_column(String(30), nullable=False)
    event_id: Mapped[str] = mapped_column(String(200), nullable=False)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
