"""In-app notifications, push devices and notification preferences.

Other services call ``notify`` (or one of the helpers below it) inside their
own transaction, before they commit. That writes the inbox rows and, for the
channels each person has switched on, the push and email jobs. The worker
(``app.services.notification_jobs``) sends those jobs later, so a slow push or
email service never slows down a request, and nothing is sent for an action
that rolled back.

- Everyone gets every notification in the in-app inbox. Preferences only
  switch push and email on or off, per category.
- The person who caused a notification never gets it.
- A ``dedupe_key`` makes a notification happen once per person, e.g. one
  "live now" per meeting.
"""

import uuid
from collections.abc import Iterable, Iterator
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.core.identity import UserId
from app.models.community import Community, CommunityMembership
from app.models.event import Event, EventRegistration, RegistrationStatus
from app.models.meeting import Meeting, MeetingKind
from app.models.notification import (
    CATEGORY_OF_TYPE,
    DeliveryChannel,
    Notification,
    NotificationCategory,
    NotificationDelivery,
    NotificationDevice,
    NotificationPreference,
    NotificationType,
)
from app.models.post import Comment, Post
from app.models.resource import Resource
from app.models.user import User
from app.models.user_profile import UserProfile
from app.schemas.notification import (
    DeviceRead,
    DeviceRegister,
    NotificationRead,
    PreferenceRead,
    PreferenceUpdate,
)
from app.services import pagination
from app.services.errors import NotFound

NOTIFICATION_NOT_FOUND = NotFound("notification_not_found", "Notification not found.")
DEVICE_NOT_FOUND = NotFound("device_not_found", "Device not found.")

# (push, email) for a category nobody has changed.
DEFAULT_CHANNELS: dict[NotificationCategory, tuple[bool, bool]] = {
    NotificationCategory.SOCIAL: (True, False),
    NotificationCategory.COMMUNITY: (True, False),
    NotificationCategory.EVENTS: (True, True),
    NotificationCategory.MEETINGS: (True, False),
    NotificationCategory.RESOURCES: (False, False),
}

# A user keeps at most this many push devices; the least recently seen go.
MAX_DEVICES_PER_USER = 10

# Keeps IN (...) lists well under database parameter limits.
CHUNK_SIZE = 500

PREVIEW_LENGTH = 140


def _now() -> datetime:
    return datetime.now(UTC)


def _chunks(items: list, size: int = CHUNK_SIZE) -> Iterator[list]:
    for start in range(0, len(items), size):
        yield items[start : start + size]


def _preview(text: str | None) -> str | None:
    if not text:
        return None
    text = " ".join(text.split())
    if len(text) <= PREVIEW_LENGTH:
        return text
    return text[: PREVIEW_LENGTH - 1].rstrip() + "…"


def display_name(db: Session, user_id: UserId | None) -> str:
    if user_id is None:
        return "Someone"
    name = db.scalar(select(UserProfile.display_name).where(UserProfile.user_id == user_id))
    return name or "Someone"


# Creating notifications


def _channels_for(
    db: Session, user_ids: list[UserId], category: NotificationCategory
) -> dict[UserId, tuple[bool, bool]]:
    default = DEFAULT_CHANNELS[category]
    channels = dict.fromkeys(user_ids, default)
    for chunk in _chunks(user_ids):
        rows = db.execute(
            select(
                NotificationPreference.user_id,
                NotificationPreference.push_enabled,
                NotificationPreference.email_enabled,
            ).where(
                NotificationPreference.user_id.in_(chunk),
                NotificationPreference.category == category.value,
            )
        )
        for user_id, push, email in rows:
            channels[user_id] = (push, email)
    return channels


def _users_with_devices(db: Session, user_ids: list[UserId]) -> set[UserId]:
    found: set[UserId] = set()
    for chunk in _chunks(user_ids):
        found.update(
            db.scalars(
                select(NotificationDevice.user_id)
                .where(NotificationDevice.user_id.in_(chunk))
                .distinct()
            )
        )
    return found


def _active_users(db: Session, user_ids: list[UserId]) -> list[UserId]:
    active: set[UserId] = set()
    for chunk in _chunks(user_ids):
        active.update(
            db.scalars(select(User.id).where(User.id.in_(chunk), User.is_active.is_(True)))
        )
    return [user_id for user_id in user_ids if user_id in active]


def _already_notified(db: Session, user_ids: list[UserId], dedupe_key: str) -> set[UserId]:
    found: set[UserId] = set()
    for chunk in _chunks(user_ids):
        found.update(
            db.scalars(
                select(Notification.user_id).where(
                    Notification.user_id.in_(chunk),
                    Notification.dedupe_key == dedupe_key,
                )
            )
        )
    return found


def notify(
    db: Session,
    recipients: Iterable[UserId],
    type: NotificationType,
    title: str,
    body: str | None = None,
    data: dict | None = None,
    actor_id: UserId | None = None,
    dedupe_key: str | None = None,
) -> int:
    """Add a notification for each recipient, plus their push and email jobs.

    Does not commit: the caller's commit saves it with the action itself.
    Returns how many people were notified.
    """
    category = CATEGORY_OF_TYPE[type]
    # Keep the caller's order (stable for tests), drop repeats and the actor.
    user_ids = [
        user_id
        for user_id in dict.fromkeys(recipients)
        if user_id is not None and user_id != actor_id
    ]
    user_ids = _active_users(db, user_ids)
    if dedupe_key is not None:
        done = _already_notified(db, user_ids, dedupe_key)
        user_ids = [user_id for user_id in user_ids if user_id not in done]
    if not user_ids:
        return 0

    channels = _channels_for(db, user_ids, category)
    with_devices = _users_with_devices(db, user_ids)
    data = {key: str(value) for key, value in (data or {}).items() if value is not None}
    now = _now()
    rows: list = []
    for user_id in user_ids:
        notification = Notification(
            id=uuid.uuid4(),
            user_id=user_id,
            actor_id=actor_id,
            type=type.value,
            category=category.value,
            title=title,
            body=body,
            data=data,
            dedupe_key=dedupe_key,
            created_at=now,
        )
        rows.append(notification)
        push, email = channels[user_id]
        if push and user_id in with_devices:
            rows.append(
                NotificationDelivery(
                    notification_id=notification.id,
                    channel=DeliveryChannel.PUSH.value,
                    next_attempt_at=now,
                )
            )
        if email:
            rows.append(
                NotificationDelivery(
                    notification_id=notification.id,
                    channel=DeliveryChannel.EMAIL.value,
                    next_attempt_at=now,
                )
            )
    db.add_all(rows)
    return len(user_ids)


# What the other services call


def comment_added(db: Session, post: Post, comment: Comment) -> None:
    name = display_name(db, comment.author_id)
    notify(
        db,
        [post.author_id],
        NotificationType.COMMENT_ON_POST,
        title=f"{name} commented on your post",
        body=_preview(comment.body),
        data={
            "community_id": post.community_id,
            "post_id": post.id,
            "comment_id": comment.id,
        },
        actor_id=comment.author_id,
    )


def _community_name(db: Session, community_id: uuid.UUID | None) -> str | None:
    if community_id is None:
        return None
    return db.scalar(select(Community.name).where(Community.id == community_id))


def member_role_changed(
    db: Session, membership: CommunityMembership, actor_id: UserId
) -> None:
    community = _community_name(db, membership.community_id)
    notify(
        db,
        [membership.user_id],
        NotificationType.COMMUNITY_ROLE_CHANGED,
        title=f"You are now {_article(membership.role)} {membership.role} of {community}",
        data={"community_id": membership.community_id, "role": membership.role},
        actor_id=actor_id,
    )


def _article(word: str) -> str:
    return "an" if word[:1].lower() in "aeiou" else "a"


def member_removed(
    db: Session, community_id: uuid.UUID, user_id: UserId, actor_id: UserId
) -> None:
    community = _community_name(db, community_id)
    notify(
        db,
        [user_id],
        NotificationType.COMMUNITY_REMOVED,
        title=f"You were removed from {community}",
        data={"community_id": community_id},
        actor_id=actor_id,
    )


def _event_people(db: Session, event_id: uuid.UUID, confirmed_only: bool) -> list[UserId]:
    statement = select(EventRegistration.user_id).where(EventRegistration.event_id == event_id)
    if confirmed_only:
        statement = statement.where(
            EventRegistration.status == RegistrationStatus.REGISTERED.value
        )
    return list(db.scalars(statement.order_by(EventRegistration.created_at)))


def _event_data(event: Event) -> dict:
    return {"event_id": event.id, "community_id": event.community_id}


def event_spots_confirmed(db: Session, event: Event, user_ids: list[UserId]) -> None:
    notify(
        db,
        user_ids,
        NotificationType.EVENT_SPOT_CONFIRMED,
        title=f"You have a spot at {event.title}",
        body="A place opened up and you're off the waitlist.",
        data=_event_data(event),
    )


def _local_start(event: Event) -> str:
    starts_at = event.starts_at
    if starts_at.tzinfo is None:
        starts_at = starts_at.replace(tzinfo=UTC)
    local = starts_at.astimezone(ZoneInfo(event.timezone))
    return f"{local:%a %d %b %Y, %H:%M} ({event.timezone})"


def event_rescheduled(db: Session, event: Event, actor_id: UserId) -> None:
    notify(
        db,
        _event_people(db, event.id, confirmed_only=False),
        NotificationType.EVENT_RESCHEDULED,
        title=f"{event.title} has a new time",
        body=f"It now starts {_local_start(event)}.",
        data=_event_data(event),
        actor_id=actor_id,
    )


def event_cancelled(db: Session, event: Event, actor_id: UserId) -> None:
    notify(
        db,
        _event_people(db, event.id, confirmed_only=False),
        NotificationType.EVENT_CANCELLED,
        title=f"{event.title} was cancelled",
        data=_event_data(event),
        actor_id=actor_id,
        dedupe_key=f"event_cancelled:{event.id}",
    )


def event_reminder_key(event: Event) -> str:
    starts_at = event.starts_at
    if starts_at.tzinfo is None:
        starts_at = starts_at.replace(tzinfo=UTC)
    # Keyed by start time too, so a rescheduled event reminds again.
    return f"event_reminder:{event.id}:{int(starts_at.timestamp())}"


def event_reminder(db: Session, event: Event) -> int:
    return notify(
        db,
        _event_people(db, event.id, confirmed_only=True),
        NotificationType.EVENT_REMINDER,
        title=f"{event.title} starts soon",
        body=f"Starts {_local_start(event)}.",
        data=_event_data(event),
        dedupe_key=event_reminder_key(event),
    )


def meeting_live(db: Session, meeting: Meeting, actor_id: UserId) -> None:
    """Tell the people who can join. App-wide meetings notify nobody for now:
    that would be every user."""
    if meeting.event_id is not None:
        recipients = _event_people(db, meeting.event_id, confirmed_only=True)
    elif meeting.community_id is not None:
        recipients = list(
            db.scalars(
                select(CommunityMembership.user_id)
                .where(CommunityMembership.community_id == meeting.community_id)
                .order_by(CommunityMembership.joined_at)
            )
        )
    else:
        return
    what = "livestream" if meeting.kind == MeetingKind.LIVESTREAM.value else "meeting"
    notify(
        db,
        recipients,
        NotificationType.MEETING_LIVE,
        title=f"{meeting.title} is live",
        body=f"The {what} has started. Join now.",
        data={
            "meeting_id": meeting.id,
            "community_id": meeting.community_id,
            "event_id": meeting.event_id,
        },
        actor_id=actor_id,
        dedupe_key=f"meeting_live:{meeting.id}",
    )


def resource_published(db: Session, resource: Resource, actor_id: UserId) -> None:
    """Tell a community's members about its new resource. App-wide library
    additions notify nobody for now."""
    if resource.community_id is None:
        return
    recipients = list(
        db.scalars(
            select(CommunityMembership.user_id)
            .where(CommunityMembership.community_id == resource.community_id)
            .order_by(CommunityMembership.joined_at)
        )
    )
    community = _community_name(db, resource.community_id)
    notify(
        db,
        recipients,
        NotificationType.RESOURCE_PUBLISHED,
        title=f"New in {community}: {resource.title}",
        body=_preview(resource.summary),
        data={"resource_id": resource.id, "community_id": resource.community_id},
        actor_id=actor_id,
        dedupe_key=f"resource_published:{resource.id}",
    )


# Inbox


def _to_read(notification: Notification) -> NotificationRead:
    return NotificationRead.model_validate(
        {
            "id": notification.id,
            "type": notification.type,
            "category": notification.category,
            "title": notification.title,
            "body": notification.body,
            "data": notification.data or {},
            "actor_id": notification.actor_id,
            "read": notification.read_at is not None,
            "read_at": notification.read_at,
            "created_at": notification.created_at,
        }
    )


def list_notifications(
    db: Session,
    user_id: UserId,
    limit: int,
    cursor: str | None,
    unread_only: bool = False,
    category: NotificationCategory | None = None,
) -> tuple[list[NotificationRead], str | None]:
    """The user's notifications, newest first."""
    statement = select(Notification).where(Notification.user_id == user_id)
    if unread_only:
        statement = statement.where(Notification.read_at.is_(None))
    if category is not None:
        statement = statement.where(Notification.category == category.value)
    if cursor:
        statement = statement.where(
            pagination.after_cursor(
                Notification.created_at, Notification.id, cursor, newest_first=True
            )
        )
    statement = statement.order_by(
        *pagination.order_by(Notification.created_at, Notification.id, newest_first=True)
    ).limit(limit + 1)
    rows, next_cursor = pagination.split_page(list(db.scalars(statement)), limit)
    return [_to_read(row) for row in rows], next_cursor


def unread_count(db: Session, user_id: UserId) -> int:
    return db.scalar(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user_id, Notification.read_at.is_(None))
    )


def _own_notification(db: Session, user_id: UserId, notification_id: uuid.UUID) -> Notification:
    notification = db.get(Notification, notification_id)
    # Someone else's notification looks the same as a missing one.
    if notification is None or notification.user_id != user_id:
        raise NOTIFICATION_NOT_FOUND
    return notification


def get_notification(db: Session, user_id: UserId, notification_id: uuid.UUID) -> NotificationRead:
    return _to_read(_own_notification(db, user_id, notification_id))


def set_read(
    db: Session, user_id: UserId, notification_id: uuid.UUID, read: bool
) -> NotificationRead:
    notification = _own_notification(db, user_id, notification_id)
    if read and notification.read_at is None:
        notification.read_at = _now()
    elif not read:
        notification.read_at = None
    db.commit()
    db.refresh(notification)
    return _to_read(notification)


def mark_all_read(
    db: Session, user_id: UserId, category: NotificationCategory | None = None
) -> int:
    statement = update(Notification).where(
        Notification.user_id == user_id, Notification.read_at.is_(None)
    )
    if category is not None:
        statement = statement.where(Notification.category == category.value)
    result = db.execute(statement.values(read_at=_now()))
    db.commit()
    return result.rowcount


def delete_notification(db: Session, user_id: UserId, notification_id: uuid.UUID) -> None:
    notification = _own_notification(db, user_id, notification_id)
    db.execute(
        delete(NotificationDelivery).where(
            NotificationDelivery.notification_id == notification.id
        )
    )
    db.delete(notification)
    db.commit()


# Preferences


def list_preferences(db: Session, user_id: UserId) -> list[PreferenceRead]:
    saved = {
        row.category: row
        for row in db.scalars(
            select(NotificationPreference).where(NotificationPreference.user_id == user_id)
        )
    }
    items = []
    for category in NotificationCategory:
        push, email = DEFAULT_CHANNELS[category]
        row = saved.get(category.value)
        if row is not None:
            push, email = row.push_enabled, row.email_enabled
        items.append(PreferenceRead(category=category, push=push, email=email))
    return items


def update_preferences(
    db: Session, user_id: UserId, changes: list[PreferenceUpdate]
) -> list[PreferenceRead]:
    """Change push and/or email for the categories sent. Others stay."""
    current = {item.category: item for item in list_preferences(db, user_id)}
    for change in changes:
        item = current[change.category]
        push = item.push if change.push is None else change.push
        email = item.email if change.email is None else change.email
        row = db.scalar(
            select(NotificationPreference).where(
                NotificationPreference.user_id == user_id,
                NotificationPreference.category == change.category.value,
            )
        )
        if row is None:
            row = NotificationPreference(user_id=user_id, category=change.category.value)
            db.add(row)
        row.push_enabled = push
        row.email_enabled = email
        current[change.category] = PreferenceRead(
            category=change.category, push=push, email=email
        )
    db.commit()
    return list_preferences(db, user_id)


# Push devices


def _device_read(device: NotificationDevice) -> DeviceRead:
    return DeviceRead.model_validate(device, from_attributes=True)


def list_devices(db: Session, user_id: UserId) -> list[DeviceRead]:
    devices = db.scalars(
        select(NotificationDevice)
        .where(NotificationDevice.user_id == user_id)
        .order_by(NotificationDevice.last_seen_at.desc(), NotificationDevice.id)
    )
    return [_device_read(device) for device in devices]


def register_device(
    db: Session, user_id: UserId, data: DeviceRegister
) -> tuple[DeviceRead, bool]:
    """Save a push token for the signed-in user. Returns (device, created).

    The app calls this on every launch and after sign-in. A token already
    saved for someone else moves to this user: a shared phone only gets the
    notifications of whoever is signed in.
    """
    now = _now()
    device = db.scalar(select(NotificationDevice).where(NotificationDevice.token == data.token))
    created = device is None
    if created:
        device = NotificationDevice(user_id=user_id, token=data.token, created_at=now)
        db.add(device)
    device.user_id = user_id
    device.platform = data.platform.value
    device.app_version = data.app_version
    device.last_seen_at = now
    db.flush()

    # Forget the least recently seen devices beyond the limit.
    stale = list(
        db.scalars(
            select(NotificationDevice.id)
            .where(NotificationDevice.user_id == user_id)
            .order_by(NotificationDevice.last_seen_at.desc(), NotificationDevice.id)
            .offset(MAX_DEVICES_PER_USER)
        )
    )
    if stale:
        db.execute(delete(NotificationDevice).where(NotificationDevice.id.in_(stale)))
    db.commit()
    db.refresh(device)
    return _device_read(device), created


def remove_device(db: Session, user_id: UserId, device_id: uuid.UUID) -> None:
    """Stop push to a device, e.g. when the user signs out on it."""
    device = db.get(NotificationDevice, device_id)
    if device is None or device.user_id != user_id:
        raise DEVICE_NOT_FOUND
    db.delete(device)
    db.commit()


def remove_device_by_token(db: Session, user_id: UserId, token: str) -> None:
    result = db.execute(
        delete(NotificationDevice).where(
            NotificationDevice.user_id == user_id, NotificationDevice.token == token
        )
    )
    if result.rowcount == 0:
        raise DEVICE_NOT_FOUND
    db.commit()
