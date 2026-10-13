
from datetime import datetime, timedelta, timezone
from typing import Literal

import jwt
from pwdlib import PasswordHash

from app.core.config import settings


password_hash = PasswordHash.recommended()

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    """Return a secure password hash suitable for database storage."""
    if not password:
        raise ValueError("Password must not be empty")

    return password_hash.hash(password)


def verify_password(
    plain_password: str,
    stored_hash: str,
) -> bool:
    """Verify a password against its stored hash."""
    if not plain_password or not stored_hash:
        return False

    return password_hash.verify(plain_password, stored_hash)


def _validate_secret_key() -> None:
    """Ensure the configured secret is strong enough for JWT signing."""
    if not settings.secret_key or len(settings.secret_key) < 32:
        raise ValueError(
            "A secret key of at least 32 characters is required"
        )


def create_access_token(subject: str) -> str:
    """Create a short-lived JWT access token."""
    _validate_secret_key()

    if not subject.strip():
        raise ValueError("Token subject must not be empty")

    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )

    payload = {
        "sub": subject,
        "type": "access",
        "exp": expires_at,
    }

    return jwt.encode(
        payload,
        settings.secret_key,
        algorithm=ALGORITHM,
    )


def create_refresh_token(subject: str) -> str:
    """Create a longer-lived JWT refresh token."""
    _validate_secret_key()

    if not subject.strip():
        raise ValueError("Token subject must not be empty")

    expires_at = datetime.now(timezone.utc) + timedelta(
        days=settings.refresh_token_expire_days
    )

    payload = {
        "sub": subject,
        "type": "refresh",
        "exp": expires_at,
    }

    return jwt.encode(
        payload,
        settings.secret_key,
        algorithm=ALGORITHM,
    )


def decode_token(
    token: str,
    expected_type: Literal["access", "refresh"],
) -> dict:
    """Verify a token's signature, expiry, subject and token type."""
    _validate_secret_key()

    payload = jwt.decode(
        token,
        settings.secret_key,
        algorithms=[ALGORITHM],
        options={"require": ["exp", "sub", "type"]},
    )

    subject = payload.get("sub")

    if not isinstance(subject, str) or not subject.strip():
        raise jwt.InvalidTokenError("Invalid token subject")

    if payload.get("type") != expected_type:
        raise jwt.InvalidTokenError("Incorrect token type")

    return payload
