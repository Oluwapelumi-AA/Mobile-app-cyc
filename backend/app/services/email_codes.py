"""6-digit email codes for confirming a new account's email address.

Same rules as password reset codes: 15 minutes, 5 wrong tries, one email a
minute and 5 an hour per account, stored as an HMAC.
"""

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.emails import templates
from app.models.auth_security import EmailCode
from app.models.user import User
from app.models.user_profile import UserProfile
from app.services import mailer
from app.services.errors import InvalidInput

VERIFY_EMAIL = "verify_email"
CODE_TTL = timedelta(minutes=15)
MAX_ATTEMPTS = 5
MIN_GAP = timedelta(seconds=60)
HOURLY_LIMIT = 5

INVALID_CODE = InvalidInput("invalid_code", "That code is wrong or has expired. Ask for a new one.")


def _now() -> datetime:
    return datetime.now(UTC)


def _utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _hash(code: str) -> str:
    key = (settings.secret_key or "dev-only-key").encode()
    return hmac.new(key, ("email-code:" + code).encode(), hashlib.sha256).hexdigest()


def display_name(db: Session, user_id) -> str | None:
    name = db.scalar(select(UserProfile.display_name).where(UserProfile.user_id == user_id))
    return name.split(" ")[0] if name else None


def send_code(db: Session, user: User, purpose: str = VERIFY_EMAIL) -> bool:
    """Email a fresh code unless one went out very recently. Commits."""
    now = _now()
    recent = list(
        db.scalars(
            select(EmailCode.created_at).where(
                EmailCode.user_id == user.id,
                EmailCode.purpose == purpose,
                EmailCode.created_at >= now - timedelta(hours=1),
            )
        )
    )
    if len(recent) >= HOURLY_LIMIT or any(_utc(t) > now - MIN_GAP for t in recent):
        return False
    for old in db.scalars(
        select(EmailCode).where(
            EmailCode.user_id == user.id, EmailCode.purpose == purpose, EmailCode.used_at.is_(None)
        )
    ):
        old.used_at = now
    code = f"{secrets.randbelow(1_000_000):06d}"
    db.add(EmailCode(user_id=user.id, purpose=purpose, code_hash=_hash(code), expires_at=now + CODE_TTL, created_at=now))
    mailer.send(db, user.email, templates.verify_email(code, display_name(db, user.id)), purpose)
    db.commit()
    return True


def check_code(db: Session, user: User, code: str, purpose: str = VERIFY_EMAIL) -> None:
    """Use up a correct code, or raise ``invalid_code``. Commits on failure."""
    now = _now()
    row = db.scalar(
        select(EmailCode)
        .where(EmailCode.user_id == user.id, EmailCode.purpose == purpose, EmailCode.used_at.is_(None))
        .order_by(EmailCode.created_at.desc())
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
