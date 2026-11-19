
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
    ChangePasswordRequest,
    DeleteAccountRequest,
    LoginRequest,
    LogoutRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
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
from app.models.moderation import AuditLog
from app.models.refresh_session import RefreshSession
from app.models.user import User
from app.services import account, password_reset


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
        # The app shows "Your account is suspended" with the reason staff gave.
        reason = db.scalar(
            select(AuditLog.data)
            .where(AuditLog.action == "user.suspended", AuditLog.target_id == user.id)
            .order_by(AuditLog.created_at.desc())
            .limit(1)
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "account_suspended",
                "message": "This account is inactive",
                "reason": (reason or {}).get("reason"),
            },
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


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    request: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change your password. Use this after signing in with a temporary
    password from an admin. Signs you out on every other device."""
    if not verify_password(request.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "wrong_password", "message": "Your current password is wrong."},
        )
    if request.new_password == request.current_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "same_password", "message": "Choose a password you haven't used here."},
        )
    user = db.get(User, current_user.id)
    user.password_hash = hash_password(request.new_password)
    now = datetime.now(timezone.utc)
    for session in db.scalars(
        select(RefreshSession).where(
            RefreshSession.user_id == user.id, RefreshSession.revoked_at.is_(None)
        )
    ):
        session.revoked_at = now
    db.commit()


@router.post("/password-reset/request", status_code=status.HTTP_202_ACCEPTED)
def request_password_reset(
    request: PasswordResetRequest,
    db: Session = Depends(get_db),
):
    """Email a 6-digit code to reset a forgotten password.

    Always answers the same way, whether or not the email has an account.
    """
    password_reset.request_code(db, str(request.email))
    return {"message": "If that email has an account, we've sent a code to it."}


@router.post("/password-reset/confirm", status_code=status.HTTP_204_NO_CONTENT)
def confirm_password_reset(
    request: PasswordResetConfirm,
    db: Session = Depends(get_db),
):
    """Set a new password with the emailed code. Signs out everywhere."""
    password_reset.reset_password(db, str(request.email), request.code, request.new_password)


@router.post("/delete-account", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_account(
    request: DeleteAccountRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Permanently delete your account. Confirm with your password.

    Your name, email, photo and details are wiped and you're signed out
    everywhere. Posts and comments stay, shown as "Deleted user".
    """
    account.delete_account(db, current_user.id, request.password)
