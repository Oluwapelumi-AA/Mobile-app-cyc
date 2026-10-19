"""Background jobs for notifications, run by ``python -m app.workers.notifications``.

- ``send_event_reminders`` notifies people with a spot shortly before their
  event starts (``EVENT_REMINDER_MINUTES_BEFORE``).
- ``process_deliveries`` sends due push and email jobs. A failed send is
  tried again after 1, 2, 4, 8... minutes, up to
  ``NOTIFICATION_MAX_ATTEMPTS`` tries, then marked failed. Jobs for a
  notification already read in the app are skipped. Dead push tokens are
  forgotten.
- ``prune_notifications`` deletes notifications older than
  ``NOTIFICATION_RETENTION_DAYS``.

Several workers can run at once on PostgreSQL: each locks the jobs it takes
with ``FOR UPDATE SKIP LOCKED``.
"""

import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.event import Event, EventStatus
from app.models.notification import (
    DeliveryChannel,
    DeliveryStatus,
    Notification,
    NotificationDelivery,
    NotificationDevice,
)
from app.models.user import User
from app.services import notifications
from app.services.email_sender import (
    EmailMessage,
    EmailSender,
    EmailUnavailable,
)
from app.services.push_provider import (
    PushMessage,
    PushProvider,
    PushUnavailable,
)

logger = logging.getLogger(__name__)

DEFAULT_BATCH_SIZE = 100
FIRST_RETRY_DELAY = timedelta(minutes=1)
MAX_RETRY_DELAY = timedelta(hours=1)

EMAIL_FOOTER = (
    "\n\n—\nYou're getting this email from The Light App. "
    "You can change which emails you get in the app under Settings > Notifications."
)


def _now() -> datetime:
    return datetime.now(UTC)


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


class _Skip(Exception):
    """Nothing to send for this job."""


@dataclass
class DeliveryStats:
    sent: int = 0
    skipped: int = 0
    retrying: int = 0
    failed: int = 0
    removed_devices: int = 0
    errors: list[str] = field(default_factory=list)

    @property
    def handled(self) -> int:
        return self.sent + self.skipped + self.retrying + self.failed

    def add(self, other: "DeliveryStats") -> None:
        for name in ("sent", "skipped", "retrying", "failed", "removed_devices"):
            setattr(self, name, getattr(self, name) + getattr(other, name))
        self.errors.extend(other.errors)


def retry_delay(attempts: int) -> timedelta:
    return min(FIRST_RETRY_DELAY * 2 ** (attempts - 1), MAX_RETRY_DELAY)


def _send_push(
    db: Session, notification: Notification, provider: PushProvider, stats: DeliveryStats
) -> None:
    devices = list(
        db.scalars(
            select(NotificationDevice).where(NotificationDevice.user_id == notification.user_id)
        )
    )
    if not devices:
        raise _Skip("no devices")
    message = PushMessage(
        title=notification.title,
        body=notification.body,
        data={
            **(notification.data or {}),
            "notification_id": str(notification.id),
            "type": notification.type,
        },
        badge=notifications.unread_count(db, notification.user_id),
    )
    try:
        result = provider.send([device.token for device in devices], message)
    except PushUnavailable:
        raise _Skip("push is off") from None
    dead = [device for device in devices if device.token in result.invalid_tokens]
    for device in dead:
        db.delete(device)
    stats.removed_devices += len(dead)
    if len(dead) == len(devices):
        raise _Skip("no working devices")


def _send_email(db: Session, notification: Notification, sender: EmailSender) -> None:
    email = db.scalar(select(User.email).where(User.id == notification.user_id))
    if not email:
        raise _Skip("no email address")
    text = notification.title
    if notification.body:
        text += "\n\n" + notification.body
    try:
        sender.send(
            EmailMessage(to=email, subject=notification.title, text=text + EMAIL_FOOTER)
        )
    except EmailUnavailable:
        raise _Skip("email is off") from None


def process_deliveries(
    db: Session,
    push: PushProvider,
    email: EmailSender,
    now: datetime | None = None,
    batch_size: int = DEFAULT_BATCH_SIZE,
) -> DeliveryStats:
    """Send push and email jobs that are due. Commits."""
    now = now or _now()
    stats = DeliveryStats()
    jobs = list(
        db.scalars(
            select(NotificationDelivery)
            .where(
                NotificationDelivery.status == DeliveryStatus.PENDING.value,
                NotificationDelivery.next_attempt_at <= now,
            )
            .order_by(NotificationDelivery.next_attempt_at, NotificationDelivery.id)
            .limit(batch_size)
            .with_for_update(skip_locked=True)
        )
    )
    for job in jobs:
        notification = db.get(Notification, job.notification_id)
        active = db.scalar(select(User.is_active).where(User.id == notification.user_id))
        try:
            if notification.read_at is not None:
                raise _Skip("already read in the app")
            if not active:
                raise _Skip("user is not active")
            if job.channel == DeliveryChannel.PUSH.value:
                _send_push(db, notification, push, stats)
            else:
                _send_email(db, notification, email)
        except _Skip as skip:
            job.status = DeliveryStatus.SKIPPED.value
            job.last_error = str(skip)
            stats.skipped += 1
        except Exception as exc:  # noqa: BLE001
            # PushError, EmailError or anything unexpected: retry later, and
            # keep going with the other jobs.
            job.attempts += 1
            job.last_error = f"{exc.__class__.__name__}: {exc}"[:500]
            if job.attempts >= settings.notification_max_attempts:
                job.status = DeliveryStatus.FAILED.value
                stats.failed += 1
            else:
                job.next_attempt_at = now + retry_delay(job.attempts)
                stats.retrying += 1
            stats.errors.append(job.last_error)
            logger.warning(
                "notification %s %s send failed (attempt %s): %s",
                job.notification_id,
                job.channel,
                job.attempts,
                job.last_error,
            )
        else:
            job.attempts += 1
            job.status = DeliveryStatus.SENT.value
            job.sent_at = now
            job.last_error = None
            stats.sent += 1
    db.commit()
    return stats


def send_event_reminders(db: Session, now: datetime | None = None) -> int:
    """Remind people with a spot about events starting soon. Commits.

    Each person is reminded once per event start time, so running this often
    is harmless. Returns how many people were reminded.
    """
    now = now or _now()
    window_end = now + timedelta(minutes=settings.event_reminder_minutes_before)
    events = db.scalars(
        select(Event).where(
            Event.status == EventStatus.SCHEDULED.value,
            Event.starts_at > now,
            Event.starts_at <= window_end,
        )
    )
    reminded = 0
    for event in events:
        reminded += notifications.event_reminder(db, event)
    db.commit()
    return reminded


def prune_notifications(db: Session, now: datetime | None = None) -> int:
    """Delete notifications past the retention period. Commits."""
    now = now or _now()
    cutoff = now - timedelta(days=settings.notification_retention_days)
    old = select(Notification.id).where(Notification.created_at < cutoff)
    count = db.scalar(select(func.count()).select_from(old.subquery()))
    if count:
        db.execute(
            delete(NotificationDelivery).where(NotificationDelivery.notification_id.in_(old))
        )
        db.execute(delete(Notification).where(Notification.created_at < cutoff))
    db.commit()
    return count or 0
