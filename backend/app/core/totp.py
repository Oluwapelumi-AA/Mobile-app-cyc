"""Time-based one-time codes (RFC 6238), as used by Google Authenticator,
Microsoft Authenticator, Authy and 1Password. 6 digits, 30-second steps."""

import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote

STEP_SECONDS = 30
DIGITS = 6


def new_secret() -> str:
    """A random 160-bit secret, base32 without padding."""
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _key(secret: str) -> bytes:
    padded = secret.upper() + "=" * (-len(secret) % 8)
    return base64.b32decode(padded)


def code_at(secret: str, at: float, offset: int = 0) -> str:
    counter = int(at // STEP_SECONDS) + offset
    digest = hmac.new(_key(secret), struct.pack(">Q", counter), hashlib.sha1).digest()
    start = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[start : start + 4])[0] & 0x7FFFFFFF
    return str(value % 10**DIGITS).zfill(DIGITS)


def step_of(at: float) -> int:
    return int(at // STEP_SECONDS)


def matching_step(secret: str, code: str, at: float | None = None, window: int = 1) -> int | None:
    """The time step the code belongs to (allowing one step of clock drift
    either way), or None. Callers store the step so a code can't be reused."""
    code = code.strip().replace(" ", "")
    if len(code) != DIGITS or not code.isdigit():
        return None
    now = time.time() if at is None else at
    for offset in range(-window, window + 1):
        if hmac.compare_digest(code_at(secret, now, offset), code):
            return step_of(now) + offset
    return None


def otpauth_uri(secret: str, account: str, issuer: str) -> str:
    label = quote(f"{issuer}:{account}")
    return (
        f"otpauth://totp/{label}?secret={secret}&issuer={quote(issuer)}"
        f"&algorithm=SHA1&digits={DIGITS}&period={STEP_SECONDS}"
    )
