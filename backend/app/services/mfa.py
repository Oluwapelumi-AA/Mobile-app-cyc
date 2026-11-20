"""Two-step sign-in with an authenticator app, plus one-time recovery codes.

Admins must use it when REQUIRE_ADMIN_MFA is on (the default); anyone else
can turn it on. A code can't be used twice: the last accepted time step is
remembered per user.
"""

import hashlib
import hmac
import secrets
from datetime import UTC, datetime

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core import crypto, totp
from app.core.config import settings
from app.models.auth_security import MfaRecoveryCode
from app.models.user import AccountRole, User
from app.services.errors import InvalidInput

RECOVERY_CODE_COUNT = 10
WRONG_CODE = InvalidInput("invalid_mfa_code", "That code didn't work. Check your authenticator app and try again.")

# Last accepted time step per user, so a code can't be replayed. Lives in
# memory: a code is only valid for about a minute anyway.
_last_step: dict[str, int] = {}


def _now() -> datetime:
    return datetime.now(UTC)


def _hash(code: str) -> str:
    key = (settings.secret_key or "dev-only-key").encode()
    normal = code.strip().replace("-", "").replace(" ", "").lower()
    return hmac.new(key, ("mfa-recovery:" + normal).encode(), hashlib.sha256).hexdigest()


def is_enabled(user: User) -> bool:
    return user.mfa_enabled_at is not None and bool(user.mfa_secret)


def is_required(user: User) -> bool:
    return settings.require_admin_mfa and user.account_role == AccountRole.ADMIN


def start_setup(db: Session, user: User) -> tuple[str, str]:
    """A new secret (not active until confirmed). Returns (secret, otpauth URI)."""
    if is_enabled(user):
        raise InvalidInput("mfa_already_on", "Two-step sign-in is already on.")
    secret = totp.new_secret()
    user.mfa_secret = crypto.encrypt(secret)
    db.commit()
    return secret, totp.otpauth_uri(secret, user.email, settings.mfa_issuer)


def _secret(user: User) -> str | None:
    return crypto.decrypt(user.mfa_secret) if user.mfa_secret else None


def _check_totp(user: User, code: str) -> bool:
    secret = _secret(user)
    if not secret:
        return False
    step = totp.matching_step(secret, code)
    if step is None or _last_step.get(str(user.id), -1) >= step:
        return False
    _last_step[str(user.id)] = step
    return True


def new_recovery_codes(db: Session, user: User) -> list[str]:
    db.execute(delete(MfaRecoveryCode).where(MfaRecoveryCode.user_id == user.id))
    codes = []
    for _ in range(RECOVERY_CODE_COUNT):
        raw = secrets.token_hex(5)
        code = f"{raw[:5]}-{raw[5:]}"
        codes.append(code)
        db.add(MfaRecoveryCode(user_id=user.id, code_hash=_hash(code)))
    return codes


def confirm_setup(db: Session, user: User, code: str) -> list[str]:
    """Turn it on with a first code. Returns recovery codes. Commits."""
    if is_enabled(user):
        raise InvalidInput("mfa_already_on", "Two-step sign-in is already on.")
    if not _check_totp(user, code):
        raise WRONG_CODE
    user.mfa_enabled_at = _now()
    codes = new_recovery_codes(db, user)
    db.commit()
    return codes


def check(db: Session, user: User, code: str) -> bool:
    """A current authenticator code or an unused recovery code."""
    clean = code.strip().replace(" ", "")
    if clean.isdigit() and len(clean) == totp.DIGITS:
        return _check_totp(user, clean)
    row = db.scalar(
        select(MfaRecoveryCode).where(
            MfaRecoveryCode.user_id == user.id,
            MfaRecoveryCode.code_hash == _hash(clean),
            MfaRecoveryCode.used_at.is_(None),
        )
    )
    if row is None:
        return False
    row.used_at = _now()
    return True


def recovery_codes_left(db: Session, user: User) -> int:
    return db.scalar(
        select(func.count())
        .select_from(MfaRecoveryCode)
        .where(MfaRecoveryCode.user_id == user.id, MfaRecoveryCode.used_at.is_(None))
    ) or 0


def turn_off(db: Session, user: User) -> None:
    user.mfa_secret = None
    user.mfa_enabled_at = None
    db.execute(delete(MfaRecoveryCode).where(MfaRecoveryCode.user_id == user.id))
    _last_step.pop(str(user.id), None)
