
import hmac
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.v1.auth_schemas import (
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.db.session import get_db
from app.models.refresh_session import RefreshSession
from app.models.user import User


router = APIRouter(prefix="/auth", tags=["Authentication"])


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate authentication credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _create_refresh_session(
    db: Session,
    user: User,
) -> str:
    """Create a refresh token and persist only its hash."""
    session_id = uuid.uuid4()

    refresh_token = create_refresh_token(
        subject=str(user.id),
        session_id=session_id,
    )

    session = RefreshSession(
        id=session_id,
        user_id=user.id,
        token_hash=hash_refresh_token(refresh_token),
        expires_at=(
            datetime.now(timezone.utc)
            + timedelta(days=settings.refresh_token_expire_days)
        ),
    )

    db.add(session)
    return refresh_token


def _get_valid_refresh_session(
    db: Session,
    refresh_token: str,
) -> tuple[dict, RefreshSession, User]:
    """Validate a refresh token against its persisted session."""
    try:
        payload = decode_token(
            refresh_token,
            expected_type="refresh",
        )
        user_id = uuid.UUID(payload["sub"])
        session_id = uuid.UUID(payload["sid"])
    except (jwt.InvalidTokenError, ValueError, TypeError, KeyError):
        raise _unauthorized() from None

    session = db.scalar(
        select(RefreshSession).where(
            RefreshSession.id == session_id,
            RefreshSession.user_id == user_id,
        )
    )

    if session is None or session.revoked_at is not None:
        raise _unauthorized()

    # SQLite can return timezone-naive datetimes.
    expires_at = session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at <= datetime.now(timezone.utc):
        raise _unauthorized()

    expected_hash = hash_refresh_token(refresh_token)
    if not hmac.compare_digest(session.token_hash, expected_hash):
        raise _unauthorized()

    user = db.get(User, user_id)

    if user is None or not user.is_active:
        raise _unauthorized()

    return payload, session, user


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(
    request: RegisterRequest,
    db: Session = Depends(get_db),
):
    email = str(request.email).strip().lower()

    existing_user = db.scalar(
        select(User).where(User.email == email)
    )

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    user = User(
        email=email,
        password_hash=hash_password(request.password),
    )
    db.add(user)

    try:
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        ) from None

    return user


@router.post("/login", response_model=TokenResponse)
def login(
    request: LoginRequest,
    db: Session = Depends(get_db),
):
    email = str(request.email).strip().lower()

    user = db.scalar(
        select(User).where(User.email == email)
    )

    if user is None or not verify_password(
        request.password,
        user.password_hash,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is inactive",
        )

    user.last_login_at = datetime.now(timezone.utc)

    try:
        refresh_token = _create_refresh_session(db, user)
        access_token = create_access_token(str(user.id))
        db.commit()
    except Exception:
        db.rollback()
        raise

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh_tokens(
    request: RefreshRequest,
    db: Session = Depends(get_db),
):
    """Rotate the refresh token and revoke its previous session."""
    _, old_session, user = _get_valid_refresh_session(
        db,
        request.refresh_token,
    )

    old_session.revoked_at = datetime.now(timezone.utc)

    try:
        new_refresh_token = _create_refresh_session(db, user)

        new_payload = decode_token(
            new_refresh_token,
            expected_type="refresh",
        )

        old_session.replaced_by_session_id = uuid.UUID(
            new_payload["sid"]
        )

        access_token = create_access_token(str(user.id))

        db.commit()
    except Exception:
        db.rollback()
        raise

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
    )


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
)
def logout(
    request: LogoutRequest,
    db: Session = Depends(get_db),
):
    """Revoke the refresh session associated with the supplied token."""
    _, session, _ = _get_valid_refresh_session(
        db,
        request.refresh_token,
    )

    session.revoked_at = datetime.now(timezone.utc)

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    return None


@router.get("/me", response_model=UserResponse)
def get_me(
    current_user: User = Depends(get_current_user),
):
    """Return the authenticated user's account details."""
    return current_user
