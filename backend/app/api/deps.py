
import uuid

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db.session import get_db
from app.models.user import User
from app.core.identity import UserId
from app.services.avatar_storage import (
    AvatarStorage,
    UnconfiguredAvatarStorage,
)
from app.services.profiles import (
    ProfileRepository,
    SqlAlchemyProfileRepository,
)

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        bearer_scheme
    ),
    db: Session = Depends(get_db),
) -> User:
    """Return the authenticated, active user."""

    unauthorized = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail={
        "code": "not_authenticated",
        "message": "Could not validate authentication credentials",
    },
    headers={"WWW-Authenticate": "Bearer"},
)

    if credentials is None:
        raise unauthorized

    try:
        payload = decode_token(
            credentials.credentials,
            expected_type="access",
        )
        user_id = uuid.UUID(payload["sub"])
    except (jwt.InvalidTokenError, ValueError, TypeError, KeyError):
        raise unauthorized from None

    user = db.scalar(select(User).where(User.id == user_id))

    if user is None or not user.is_active:
        raise unauthorized

    return user


def get_current_user_id(
    current_user: User = Depends(get_current_user),
) -> UserId:
    """Return the authenticated user's UUID for other API modules."""
    return current_user.id


def get_profile_repository(db: Session = Depends(get_db)) -> ProfileRepository:
    """Provide the database-backed profile repository to API dependencies."""
    return SqlAlchemyProfileRepository(db)


def get_avatar_storage() -> AvatarStorage:
    """Provide avatar storage to API dependencies."""
    return UnconfiguredAvatarStorage()
