"""Check Google ID tokens from "Continue with Google".

The app (Expo) or the dashboard (Google Identity Services) gets an ID token
from Google and sends it to ``POST /auth/google``. We check its signature
against Google's published keys, that it was issued for one of our client
IDs (GOOGLE_CLIENT_IDS), that it hasn't expired, and that Google has
verified the email address.
"""

from dataclasses import dataclass
from functools import lru_cache

import jwt

from app.core.config import settings
from app.services.errors import InvalidInput

GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_ISSUERS = ("accounts.google.com", "https://accounts.google.com")

INVALID = InvalidInput("invalid_google_token", "Google sign-in didn't work. Please try again.")


class GoogleSignInOff(Exception):
    pass


@dataclass(frozen=True)
class GoogleIdentity:
    sub: str
    email: str
    name: str | None
    picture: str | None


@lru_cache
def _jwks() -> jwt.PyJWKClient:
    return jwt.PyJWKClient(GOOGLE_CERTS_URL, cache_keys=True, lifespan=3600)


def verify_id_token(token: str) -> GoogleIdentity:
    if not settings.google_client_ids:
        raise GoogleSignInOff()
    try:
        key = _jwks().get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            key.key,
            algorithms=["RS256"],
            audience=settings.google_client_ids,
            options={"require": ["exp", "iat", "iss", "aud", "sub"]},
            leeway=30,
        )
    except (jwt.PyJWTError, ValueError) as exc:
        raise INVALID from exc
    if claims.get("iss") not in GOOGLE_ISSUERS:
        raise INVALID
    email = str(claims.get("email") or "").strip().lower()
    if not email or claims.get("email_verified") not in (True, "true"):
        raise InvalidInput("google_email_unverified", "Your Google email isn't verified yet.")
    return GoogleIdentity(
        sub=str(claims["sub"]),
        email=email,
        name=(claims.get("name") or claims.get("given_name") or None),
        picture=claims.get("picture"),
    )
