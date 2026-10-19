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


class NotificationCategory(str, Enum):
    """What people switch push and email on and off for."""

    # Comments (and later reactions) on your posts.
    SOCIAL = "social"
    # Your role in a community changed, you were removed or banned, or a
    # moderator removed something you wrote.
    COMMUNITY = "community"
    # Event spots, reminders, changes and cancellations.
    EVENTS = "events"
    # A meeting or livestream you can join went live.
    MEETINGS = "meetings"
    # New resources in your communities.
    RESOURCES = "resources"


class NotificationType(str, Enum):
    COMMENT_ON_POST = "comment_on_post"
    COMMUNITY_ROLE_CHANGED = "community_role_changed"
    COMMUNITY_REMOVED = "community_removed"
    COMMUNITY_BANNED = "community_banned"
    CONTENT_REMOVED = "content_removed"
    EVENT_SPOT_CONFIRMED = "event_spot_confirmed"
    EVENT_RESCHEDULED = "event_rescheduled"
    EVENT_CANCELLED = "event_cancelled"
    EVENT_REMINDER = "event_reminder"
    MEETING_LIVE = "meeting_live"
    RESOURCE_PUBLISHED = "resource_published"


CATEGORY_OF_TYPE: dict[NotificationType, NotificationCategory] = {
    NotificationType.COMMENT_ON_POST: NotificationCategory.SOCIAL,
    NotificationType.COMMUNITY_ROLE_CHANGED: NotificationCategory.COMMUNITY,
    NotificationType.COMMUNITY_REMOVED: NotificationCategory.COMMUNITY,
    NotificationType.COMMUNITY_BANNED: NotificationCategory.COMMUNITY,
    NotificationType.CONTENT_REMOVED: NotificationCategory.COMMUNITY,
    NotificationType.EVENT_SPOT_CONFIRMED: NotificationCategory.EVENTS,
    NotificationType.EVENT_RESCHEDULED: NotificationCategory.EVENTS,
    NotificationType.EVENT_CANCELLED: NotificationCategory.EVENTS,
    NotificationType.EVENT_REMINDER: NotificationCategory.EVENTS,
    NotificationType.MEETING_LIVE: NotificationCategory.MEETINGS,
    NotificationType.RESOURCE_PUBLISHED: NotificationCategory.RESOURCES,
}


class DeliveryChannel(str, Enum):
    PUSH = "push"
    EMAIL = "email"


class DeliveryStatus(str, Enum):
    PENDING = "pending"
    SENT = "sent"
    # Nothing to send to (no device, inactive user) or already read in-app.
    SKIPPED = "skipped"
    FAILED = "failed"


class DevicePlatform(str, Enum):
    IOS = "ios"
    ANDROID = "android"
    WEB = "web"


class Notification(Base):
    """One item in a user's in-app inbox."""

    __tablename__ = "notifications"

    __table_args__ = (
        # One notification per user per key, e.g. one reminder per event start
        # time. Rows without a key are never deduplicated.
        UniqueConstraint("user_id", "dedupe_key", name="uq_notifications_user_dedupe"),
        Index("ix_notifications_user_created", "user_id", "created_at", "id"),
        Index("ix_notifications_created", "created_at"),
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
    # Who caused it, if anyone (the commenter, the organizer, ...).
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    type: Mapped[str] = mapped_column(String(40), nullable=False)
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Ids the app needs to open the right screen, e.g. {"post_id": "..."}.
    data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    dedupe_key: Mapped[str | None] = mapped_column(String(200), nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )


class NotificationDelivery(Base):
    """A push or email job for one notification, sent by the worker."""

    __tablename__ = "notification_deliveries"

    __table_args__ = (
        CheckConstraint("channel IN ('push', 'email')", name="ck_notification_deliveries_channel"),
        CheckConstraint(
            "status IN ('pending', 'sent', 'skipped', 'failed')",
            name="ck_notification_deliveries_status",
        ),
        UniqueConstraint(
            "notification_id", "channel", name="uq_notification_deliveries_notification_channel"
        ),
        Index("ix_notification_deliveries_due", "status", "next_attempt_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    notification_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("notifications.id", ondelete="CASCADE"),
        nullable=False,
    )
    channel: Mapped[str] = mapped_column(String(10), nullable=False)
    status: Mapped[str] = mapped_column(
        String(10),
        default=DeliveryStatus.PENDING.value,
        nullable=False,
    )
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    next_attempt_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
    last_error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )


class NotificationPreference(Base):
    """A user's push and email choice for one category. No row = defaults."""

    __tablename__ = "notification_preferences"

    __table_args__ = (
        UniqueConstraint("user_id", "category", name="uq_notification_preferences_user_category"),
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
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    push_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False)
    email_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )


class NotificationDevice(Base):
    """A phone or browser that receives push notifications for a user."""

    __tablename__ = "notification_devices"

    __table_args__ = (
        CheckConstraint(
            "platform IN ('ios', 'android', 'web')",
            name="ck_notification_devices_platform",
        ),
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
        index=True,
    )
    # The push token from the device (Expo, FCM or APNs). A token belongs to
    # one device, so registering it again moves it to whoever is signed in.
    token: Mapped[str] = mapped_column(String(500), nullable=False, unique=True)
    platform: Mapped[str] = mapped_column(String(10), nullable=False)
    app_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
