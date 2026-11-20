"""Queue and send emails.

``send(db, to, rendered)`` stores the email in ``outbound_emails``. Once the
caller commits, it's sent straight away in a background thread so the
request doesn't wait for Gmail. If sending fails, the notification worker
retries it with growing waits (``deliver_pending``).

With EMAIL_BACKEND=fake (development and tests) emails are "sent" at once
into the fake outbox.
"""

import logging
import threading
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import event, select
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

log = logging.getLogger(__name__)

MAX_ATTEMPTS = 6


def _now() -> datetime:
    return datetime.now(UTC)


def _message(row: OutboundEmail) -> EmailMessage:
    return EmailMessage(to=row.to, subject=row.subject, text=row.text, html=row.html)


def send(db: Session, to: str, rendered: Rendered, template: str = "email") -> OutboundEmail | None:
    """Queue an email. It goes out after ``db.commit()``."""
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
        return row
    if sender.name == "none":
        row.status = "failed"
        row.last_error = "email is not configured"
        return row
    message = _message(row)
    row_id = row.id

    def _after_commit(_session):
        threading.Thread(target=_send_now, args=(row_id, message), daemon=True).start()

    event.listen(db, "after_commit", _after_commit, once=True)
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
            row.next_attempt_at = _now() + timedelta(minutes=2 ** row.attempts)
        return False
    row.status = "sent"
    row.sent_at = _now()
    row.last_error = None
    return True


def _send_now(row_id: uuid.UUID, message: EmailMessage) -> None:
    """Runs in a thread after the request's commit."""
    from app.db.session import SessionLocal

    with SessionLocal() as db:
        row = db.get(OutboundEmail, row_id)
        if row is None or row.status != "pending":
            return
        _attempt(row, get_email_sender())
        try:
            db.commit()
        except Exception:  # noqa: BLE001
            log.exception("Couldn't record email delivery")


def deliver_pending(db: Session, sender: EmailSender | None = None, batch_size: int = 50) -> int:
    """Retry queued emails that are due. Returns how many were sent. Commits."""
    sender = sender or get_email_sender()
    rows = list(
        db.scalars(
            select(OutboundEmail)
            .where(OutboundEmail.status == "pending", OutboundEmail.next_attempt_at <= _now())
            .order_by(OutboundEmail.next_attempt_at)
            .limit(batch_size)
            .with_for_update(skip_locked=True)
        )
    )
    sent = sum(1 for row in rows if _attempt(row, sender))
    db.commit()
    return sent


def purge_old(db: Session, days: int | None = None) -> None:
    """Drop sent and failed emails after the notification retention period."""
    cutoff = _now() - timedelta(days=days or settings.notification_retention_days)
    for row in db.scalars(
        select(OutboundEmail).where(OutboundEmail.status != "pending", OutboundEmail.created_at < cutoff)
    ):
        db.delete(row)
