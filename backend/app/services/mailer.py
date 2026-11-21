
"""Queue and send emails.

SMTP emails are delivered exclusively by the notification worker.
This avoids duplicate-delivery races between request threads and workers.

With EMAIL_BACKEND=fake, emails are recorded immediately in the fake outbox.
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.emails.templates import Rendered
from app.models.auth_security import OutboundEmail
from app.services.email_sender import (
    EmailMessage,
    EmailSender,
    EmailUnavailable,
    get_email_sender,
)

MAX_ATTEMPTS = 6


def _now() -> datetime:
    return datetime.now(UTC)


def _message(row: OutboundEmail) -> EmailMessage:
    return EmailMessage(
        to=row.to,
        subject=row.subject,
        text=row.text,
        html=row.html,
    )


def send(
    db: Session,
    to: str,
    rendered: Rendered,
    template: str = "email",
) -> OutboundEmail | None:
    """Queue an email. SMTP delivery happens after commit via the worker."""

    if not to or to.endswith(".invalid"):
        return None

    row = OutboundEmail(
        id=uuid.uuid4(),
        to=to,
        template=template,
        subject=rendered.subject[:300],
        text=rendered.text,
        html=rendered.html,
        status="pending",
        attempts=0,
        next_attempt_at=_now(),
        created_at=_now(),
    )

    db.add(row)

    sender = get_email_sender()

    if sender.name == "fake":
        _attempt(row, sender)

    elif sender.name == "none":
        row.status = "failed"
        row.last_error = "email is not configured"

    # SMTP emails remain pending. The notification worker delivers them
    # after the transaction commits.
    return row


def _attempt(row: OutboundEmail, sender: EmailSender) -> bool:
    row.attempts = (row.attempts or 0) + 1

    try:
        sender.send(_message(row))

    except EmailUnavailable:
        row.status = "failed"
        row.last_error = "email is not configured"
        return False

    except Exception as exc:  # noqa: BLE001
        row.last_error = str(exc)[:300]

        if row.attempts >= MAX_ATTEMPTS:
            row.status = "failed"
        else:
            row.next_attempt_at = _now() + timedelta(
                minutes=2 ** row.attempts
            )

        return False

    row.status = "sent"
    row.sent_at = _now()
    row.last_error = None
    return True


def deliver_pending(
    db: Session,
    sender: EmailSender | None = None,
    batch_size: int = 50,
) -> int:
    """Deliver due queued emails. Returns the number successfully sent."""

    sender = sender or get_email_sender()

    rows = list(
        db.scalars(
            select(OutboundEmail)
            .where(
                OutboundEmail.status == "pending",
                OutboundEmail.next_attempt_at <= _now(),
            )
            .order_by(OutboundEmail.next_attempt_at)
            .limit(batch_size)
            .with_for_update(skip_locked=True)
        )
    )

    sent = sum(1 for row in rows if _attempt(row, sender))

    db.commit()
    return sent


def purge_old(db: Session, days: int | None = None) -> None:
    """Delete sent and failed emails after the retention period."""

    cutoff = _now() - timedelta(
        days=days or settings.notification_retention_days
    )

    for row in db.scalars(
        select(OutboundEmail).where(
            OutboundEmail.status != "pending",
            OutboundEmail.created_at < cutoff,
        )
    ):
        db.delete(row)
