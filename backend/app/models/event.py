import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import (
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


class EventStatus(str, Enum):
    SCHEDULED = "scheduled"
    CANCELLED = "cancelled"


class RegistrationStatus(str, Enum):
    REGISTERED = "registered"
    WAITLISTED = "waitlisted"


class Event(Base):
    __tablename__ = "events"

    __table_args__ = (
        CheckConstraint(
            "status IN ('scheduled', 'cancelled')",
            name="ck_events_status",
        ),
        CheckConstraint("ends_at > starts_at", name="ck_events_ends_after_start"),
        CheckConstraint(
            "capacity IS NULL OR capacity > 0",
            name="ck_events_capacity_positive",
        ),
        # Upcoming lists: soonest first, ties broken by id.
        Index("ix_events_schedule", "starts_at", "id"),
        Index("ix_events_community_schedule", "community_id", "starts_at", "id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    # Null for app-wide events run by CYC itself.
    community_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("communities.id", ondelete="CASCADE"),
        nullable=True,
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(String(300), nullable=True)
    online_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Stored in UTC. ``timezone`` is the IANA zone the organizer scheduled in,
    # used to show local times.
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    # Null means unlimited.
    capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(
        String(10),
        default=EventStatus.SCHEDULED.value,
        nullable=False,
    )
    cancelled_at: Mapped[datetime | None] = mapped_column(
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


class EventRegistration(Base):
    __tablename__ = "event_registrations"

    __table_args__ = (
        CheckConstraint(
            "status IN ('registered', 'waitlisted')",
            name="ck_event_registrations_status",
        ),
        UniqueConstraint(
            "event_id",
            "user_id",
            name="uq_event_registrations_event_user",
        ),
        # Counts per status and the waitlist in sign-up order.
        Index(
            "ix_event_registrations_event_status",
            "event_id",
            "status",
            "created_at",
            "id",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(10), nullable=False)
    attended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    checked_in_by: Mapped[uuid.UUID | None] = mapped_column(
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
