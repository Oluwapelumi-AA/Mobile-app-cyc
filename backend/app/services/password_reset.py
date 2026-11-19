"""Forgotten passwords: a 6-digit code by email, then a new password.

- Asking for a code always answers the same way, whether or not the email
  has an account, so the endpoint can't be used to find out who's signed up.
- Codes last 15 minutes and allow 5 wrong tries. Asking again replaces the
  previous code. Codes are stored as an HMAC, never in plain text.
- At most one email a minute and 5 an hour per account.
- A successful reset signs the user out everywhere and marks the email
  verified (they proved they can read it).
"""

import hashlib
import hmac
import logging
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.models.password_reset import PasswordResetCode
from app.models.refresh_session import RefreshSession
from app.models.user import User
from app.services.email_sender import EmailMessage, EmailUnavailable, get_email_sender
from app.services.errors import InvalidInput

log = logging.getLogger(__name__)

CODE_TTL = timedelta(minutes=15)
MAX_ATTEMPTS = 5
MIN_GAP = timedelta(seconds=60)
HOURLY_LIMIT = 5

INVALID_CODE = InvalidInput(
    "invalid_code", "That code is wrong or has expired. Ask for a new one."
)


def _now() -> datetime:
    return datetime.now(UTC)


def _utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _hash(code: str) -> str:
    key = (settings.secret_key or "dev-only-key").encode()
    return hmac.new(key, code.encode(), hashlib.sha256).hexdigest()


def _user(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email.strip().lower()))


def request_code(db: Session, email: str) -> None:
    """Email a reset code if the address has an active account."""
    user = _user(db, email)
    if user is None or not user.is_active:
        return
    now = _now()
    recent = list(
        db.scalars(
            select(PasswordResetCode.created_at).where(
                PasswordResetCode.user_id == user.id,
                PasswordResetCode.created_at >= now - timedelta(hours=1),
            )
        )
    )
    if len(recent) >= HOURLY_LIMIT or any(_utc(t) > now - MIN_GAP for t in recent):
        return

    # A new code replaces any unused one.
    for old in db.scalars(
        select(PasswordResetCode).where(
            PasswordResetCode.user_id == user.id, PasswordResetCode.used_at.is_(None)
        )
    ):
        old.used_at = now

    code = f"{secrets.randbelow(1_000_000):06d}"
    db.add(
        PasswordResetCode(
            user_id=user.id, code_hash=_hash(code), expires_at=now + CODE_TTL, created_at=now
        )
    )
    db.commit()

    try:
        get_email_sender().send(
            EmailMessage(
                to=user.email,
                subject="Your password reset code",
                text=(
                    f"Your code to reset your password is {code}.\n\n"
                    "It expires in 15 minutes. If you didn't ask for this, you can "
                    "ignore this email; your password hasn't changed."
                ),
            )
        )
    except EmailUnavailable:
        log.warning("Password reset requested but email is not configured")
    except Exception:
        log.exception("Password reset email failed")


def reset_password(db: Session, email: str, code: str, new_password: str) -> None:
    user = _user(db, email)
    if user is None or not user.is_active:
        raise INVALID_CODE
    now = _now()
    row = db.scalar(
        select(PasswordResetCode)
        .where(PasswordResetCode.user_id == user.id, PasswordResetCode.used_at.is_(None))
        .order_by(PasswordResetCode.created_at.desc())
        .limit(1)
    )
    if row is None or _utc(row.expires_at) <= now or row.attempts >= MAX_ATTEMPTS:
        raise INVALID_CODE
    if not hmac.compare_digest(row.code_hash, _hash(code.strip())):
        row.attempts += 1
        if row.attempts >= MAX_ATTEMPTS:
            row.used_at = now
        db.commit()
        raise INVALID_CODE

    row.used_at = now
    user.password_hash = hash_password(new_password)
    user.is_verified = True
    for session in db.scalars(
        select(RefreshSession).where(
            RefreshSession.user_id == user.id, RefreshSession.revoked_at.is_(None)
        )
    ):
        session.revoked_at = now
    db.commit()


def pending_count(db: Session, user_id) -> int:
    """Unused codes; for tests."""
    return db.scalar(
        select(func.count())
        .select_from(PasswordResetCode)
        .where(PasswordResetCode.user_id == user_id, PasswordResetCode.used_at.is_(None))
    )
