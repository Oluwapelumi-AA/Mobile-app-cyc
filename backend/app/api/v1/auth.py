
import hmac
import uuid
from datetime import datetime, timedelta, timezone

import secrets

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.v1.auth_schemas import (
    ChangePasswordRequest,
    DeleteAccountRequest,
    GoogleSignInRequest,
    LoginRequest,
    LogoutRequest,
    MfaCodeRequest,
    MfaEnableResponse,
    MfaSetupRequest,
    MfaSetupResponse,
    MfaStatus,
    PasswordResetConfirm,
    PasswordResetRequest,
    RecoveryCodesResponse,
    RefreshRequest,
    RegisterRequest,
    ResendCodeRequest,
    SetPasswordRequest,
    TokenResponse,
    UserResponse,
    VerifyEmailRequest,
)
from app.core.config import settings
from app.core.passwords import require_strong_password
from app.core.rate_limit import limiter
from app.core.security import (
    create_access_token,
    create_mfa_token,
    create_refresh_token,
    decode_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.db.session import get_db
from app.models.moderation import AuditLog
from app.models.refresh_session import RefreshSession
from app.emails import templates
from app.models.user import User
from app.services import account, audit, email_codes, google_auth, mailer, mfa, password_reset
from app.services.errors import InvalidInput


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


def _revoke_all_sessions(db: Session, user_id: uuid.UUID, keep: uuid.UUID | None = None) -> None:
    now = datetime.now(timezone.utc)
    for session in db.scalars(
        select(RefreshSession).where(
            RefreshSession.user_id == user_id, RefreshSession.revoked_at.is_(None)
        )
    ):
        if session.id != keep:
            session.revoked_at = now


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

    if session is None:
        raise _unauthorized()

    if session.revoked_at is not None:
        if session.replaced_by_session_id is not None:
            # An old, already-rotated refresh token was used again: it was
            # probably copied. End every session for this account.
            _revoke_all_sessions(db, user_id)
            db.commit()
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


# Shared sign-in steps


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _suspended(db: Session, user: User) -> HTTPException:
    # The app shows "Your account is suspended" with the reason staff gave.
    reason = db.scalar(
        select(AuditLog.data)
        .where(AuditLog.action == "user.suspended", AuditLog.target_id == user.id)
        .order_by(AuditLog.created_at.desc())
        .limit(1)
    )
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "code": "account_suspended",
            "message": "This account is inactive",
            "reason": (reason or {}).get("reason"),
        },
    )


def _issue_tokens(db: Session, user: User) -> TokenResponse:
    user.last_login_at = _now()
    user.failed_login_count = 0
    user.locked_until = None
    try:
        refresh_token = _create_refresh_session(db, user)
        access_token = create_access_token(str(user.id))
        db.commit()
    except Exception:
        db.rollback()
        raise
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


def _finish_sign_in(db: Session, user: User, method: str) -> TokenResponse:
    """After the password (or Google) checked out: two-step, then tokens."""
    if not user.is_active:
        raise _suspended(db, user)
    audit.record(db, user.id, "auth.signed_in", "user", user.id, data={"method": method})
    if mfa.is_enabled(user):
        db.commit()
        return TokenResponse(mfa_required=True, mfa_token=create_mfa_token(str(user.id), "verify"))
    if mfa.is_required(user):
        db.commit()
        return TokenResponse(mfa_setup_required=True, mfa_token=create_mfa_token(str(user.id), "setup"))
    return _issue_tokens(db, user)


def _locked(user: User) -> HTTPException | None:
    until = _utc(user.locked_until)
    if until and until > _now():
        minutes = max(1, int((until - _now()).total_seconds() // 60) + 1)
        return HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "account_locked",
                "message": f"Too many wrong passwords. Try again in {minutes} minute{'s' if minutes > 1 else ''}, or reset your password.",
            },
        )
    return None


def _wrong_attempt(db: Session, user: User) -> None:
    user.failed_login_count = (user.failed_login_count or 0) + 1
    if user.failed_login_count >= settings.login_max_failures:
        user.failed_login_count = 0
        user.locked_until = _now() + timedelta(minutes=settings.login_lock_minutes)
        audit.record(db, user.id, "auth.locked", "user", user.id)
        mailer.send(
            db,
            user.email,
            templates.account_locked(email_codes.display_name(db, user.id), settings.login_lock_minutes),
            "account_locked",
        )
    db.commit()


def _bad_credentials() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid email or password",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _not_verified() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "code": "email_not_verified",
            "message": "Confirm your email first. We've sent you a 6-digit code.",
        },
    )


# A real hash to compare against when the email is unknown, so a wrong email
# takes as long as a wrong password.
_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def _user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email.strip().lower()))


# Sign-up and sign-in


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def register(request: Request, body: RegisterRequest, db: Session = Depends(get_db)):
    """Create an account with email and password. A 6-digit code is emailed;
    confirm it with ``/auth/verify-email`` to sign in."""
    email = str(body.email).strip().lower()
    require_strong_password(body.password, email)

    if _user_by_email(db, email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    user = User(email=email, password_hash=hash_password(body.password), has_password=True)
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

    if settings.require_email_verification:
        email_codes.send_code(db, user)
    return _user_read(db, user)


@router.post("/verify-email", response_model=TokenResponse)
@limiter.limit("10/minute")
def verify_email(request: Request, body: VerifyEmailRequest, db: Session = Depends(get_db)):
    """Confirm the emailed code. Signs you in."""
    user = _user_by_email(db, str(body.email))
    if user is None:
        raise email_codes.INVALID_CODE
    if not user.is_verified:
        email_codes.check_code(db, user, body.code)
        user.is_verified = True
        mailer.send(db, user.email, templates.welcome(email_codes.display_name(db, user.id)), "welcome")
        db.commit()
    else:
        # Already confirmed (e.g. in another tab): the code still has to match.
        email_codes.check_code(db, user, body.code)
    return _finish_sign_in(db, user, "email_code")


@router.post("/verify-email/resend", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("3/minute")
def resend_verification(request: Request, body: ResendCodeRequest, db: Session = Depends(get_db)):
    """Send a new code. Answers the same way whether or not the email exists."""
    user = _user_by_email(db, str(body.email))
    if user is not None and user.is_active and not user.is_verified:
        email_codes.send_code(db, user)
    return {"message": "If that email needs confirming, we've sent a new code."}


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(request: Request, body: LoginRequest, db: Session = Depends(get_db)):
    user = _user_by_email(db, str(body.email))

    if user is None:
        verify_password(body.password, _DUMMY_HASH)
        raise _bad_credentials()

    locked = _locked(user)
    if locked:
        raise locked

    if not verify_password(body.password, user.password_hash):
        _wrong_attempt(db, user)
        raise _bad_credentials()

    if not user.is_active:
        raise _suspended(db, user)

    if settings.require_email_verification and not user.is_verified:
        email_codes.send_code(db, user)
        raise _not_verified()

    return _finish_sign_in(db, user, "password")


@router.post("/google", response_model=TokenResponse)
@limiter.limit("10/minute")
def google_sign_in(request: Request, body: GoogleSignInRequest, db: Session = Depends(get_db)):
    """Sign in or sign up with Google. Send the ID token from Google's
    sign-in. A new email gets a new account (``is_new_account``); an
    existing account with the same email is linked to Google."""
    try:
        identity = google_auth.verify_id_token(body.id_token)
    except google_auth.GoogleSignInOff:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "google_off", "message": "Google sign-in isn't set up yet."},
        ) from None

    user = db.scalar(select(User).where(User.google_sub == identity.sub))
    is_new = False
    if user is None:
        user = _user_by_email(db, identity.email)
        if user is not None:
            if user.google_sub and user.google_sub != identity.sub:
                raise InvalidInput(
                    "google_mismatch", "This email is linked to a different Google account."
                )
            if not user.is_active:
                raise _suspended(db, user)
            user.google_sub = identity.sub
            user.is_verified = True
            audit.record(db, user.id, "auth.google_linked", "user", user.id)
            mailer.send(
                db, user.email, templates.google_linked(email_codes.display_name(db, user.id)), "google_linked"
            )
        else:
            user = User(
                email=identity.email,
                password_hash=hash_password(secrets.token_urlsafe(32)),
                has_password=False,
                is_verified=True,
                google_sub=identity.sub,
            )
            db.add(user)
            try:
                db.flush()
            except IntegrityError:
                db.rollback()
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={"code": "email_taken", "message": "An account with this email already exists."},
                ) from None
            first = identity.name.split(" ")[0] if identity.name else None
            mailer.send(db, user.email, templates.welcome(first), "welcome")
            is_new = True
        db.commit()

    locked = _locked(user)
    if locked:
        raise locked
    result = _finish_sign_in(db, user, "google")
    result.is_new_account = is_new
    result.suggested_name = identity.name
    return result


# Two-step sign-in


bearer = HTTPBearer(auto_error=False)


def _mfa_user(db: Session, mfa_token: str | None, credentials: HTTPAuthorizationCredentials | None, purposes: set[str]) -> tuple[User, bool]:
    """The user from a sign-in ``mfa_token``, or else from the bearer
    token. Returns (user, came_from_sign_in)."""
    try:
        if mfa_token:
            payload = decode_token(mfa_token, expected_type="mfa")
            if payload.get("purpose") not in purposes:
                raise jwt.InvalidTokenError("wrong purpose")
            from_sign_in = True
        elif credentials is not None:
            payload = decode_token(credentials.credentials, expected_type="access")
            from_sign_in = False
        else:
            raise _unauthorized()
        user = db.get(User, uuid.UUID(payload["sub"]))
    except (jwt.InvalidTokenError, ValueError, KeyError, TypeError):
        raise _unauthorized() from None
    if user is None or not user.is_active:
        raise _unauthorized()
    return user, from_sign_in


@router.post("/mfa/verify", response_model=TokenResponse)
@limiter.limit("10/minute")
def mfa_verify(request: Request, body: MfaCodeRequest, db: Session = Depends(get_db)):
    """Second step of sign-in: the code from the authenticator app, or a
    recovery code."""
    if not body.mfa_token:
        raise _unauthorized()
    user, _ = _mfa_user(db, body.mfa_token, None, {"verify"})
    locked = _locked(user)
    if locked:
        raise locked
    if not mfa.is_enabled(user) or not mfa.check(db, user, body.code):
        _wrong_attempt(db, user)
        raise mfa.WRONG_CODE
    return _issue_tokens(db, user)


@router.get("/mfa", response_model=MfaStatus)
def mfa_status(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return MfaStatus(
        enabled=mfa.is_enabled(current_user),
        required=mfa.is_required(current_user),
        recovery_codes_left=mfa.recovery_codes_left(db, current_user),
    )


@router.post("/mfa/setup", response_model=MfaSetupResponse)
@limiter.limit("10/minute")
def mfa_setup(
    request: Request,
    body: MfaSetupRequest,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
):
    """Start two-step sign-in: add the secret (or scan the otpauth link as a
    QR code) in an authenticator app, then confirm with ``/auth/mfa/enable``."""
    user, _ = _mfa_user(db, body.mfa_token, credentials, {"setup"})
    secret, uri = mfa.start_setup(db, user)
    return MfaSetupResponse(secret=secret, otpauth_uri=uri)


@router.post("/mfa/enable", response_model=MfaEnableResponse)
@limiter.limit("10/minute")
def mfa_enable(
    request: Request,
    body: MfaCodeRequest,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
):
    """Turn two-step sign-in on with a first code. Returns 10 one-time
    recovery codes (shown once). During sign-in it also signs you in."""
    user, from_sign_in = _mfa_user(db, body.mfa_token, credentials, {"setup"})
    codes = mfa.confirm_setup(db, user, body.code)
    audit.record(db, user.id, "auth.mfa_enabled", "user", user.id)
    mailer.send(db, user.email, templates.mfa_enabled(email_codes.display_name(db, user.id)), "mfa_enabled")
    db.commit()
    tokens = _issue_tokens(db, user) if from_sign_in else TokenResponse()
    return MfaEnableResponse(**tokens.model_dump(), recovery_codes=codes)


@router.post("/mfa/disable", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
def mfa_disable(
    request: Request,
    body: MfaCodeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Turn two-step sign-in off, confirming with a current code."""
    user = db.get(User, current_user.id)
    if mfa.is_required(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "mfa_required", "message": "Admins must keep two-step sign-in on."},
        )
    if not mfa.is_enabled(user) or not mfa.check(db, user, body.code):
        raise mfa.WRONG_CODE
    mfa.turn_off(db, user)
    audit.record(db, user.id, "auth.mfa_disabled", "user", user.id)
    mailer.send(db, user.email, templates.mfa_disabled(email_codes.display_name(db, user.id)), "mfa_disabled")
    db.commit()


@router.post("/mfa/recovery-codes", response_model=RecoveryCodesResponse)
@limiter.limit("5/minute")
def mfa_new_recovery_codes(
    request: Request,
    body: MfaCodeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Replace your recovery codes (the old ones stop working)."""
    user = db.get(User, current_user.id)
    if not mfa.is_enabled(user) or not mfa.check(db, user, body.code):
        raise mfa.WRONG_CODE
    codes = mfa.new_recovery_codes(db, user)
    db.commit()
    return RecoveryCodesResponse(recovery_codes=codes)


# Sessions


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("30/minute")
def refresh_tokens(request: Request, body: RefreshRequest, db: Session = Depends(get_db)):
    """Rotate the refresh token and revoke its previous session."""
    _, old_session, user = _get_valid_refresh_session(db, body.refresh_token)

    old_session.revoked_at = _now()

    try:
        new_refresh_token = _create_refresh_session(db, user)
        new_payload = decode_token(new_refresh_token, expected_type="refresh")
        old_session.replaced_by_session_id = uuid.UUID(new_payload["sid"])
        access_token = create_access_token(str(user.id))
        db.commit()
    except Exception:
        db.rollback()
        raise

    return TokenResponse(access_token=access_token, refresh_token=new_refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(body: LogoutRequest, db: Session = Depends(get_db)):
    """Revoke the refresh session associated with the supplied token."""
    _, session, _ = _get_valid_refresh_session(db, body.refresh_token)
    session.revoked_at = _now()
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    return None


@router.post("/logout-everywhere", status_code=status.HTTP_204_NO_CONTENT)
def logout_everywhere(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Sign out on every device, including this one."""
    _revoke_all_sessions(db, current_user.id)
    db.commit()


def _user_read(db: Session, user: User) -> UserResponse:
    read = UserResponse.model_validate(user)
    read.account_role = getattr(user.account_role, "value", user.account_role)
    read.google_linked = bool(user.google_sub)
    read.mfa_enabled = mfa.is_enabled(user)
    read.mfa_required = mfa.is_required(user)
    return read


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return the authenticated user's account details."""
    return _user_read(db, current_user)


# Passwords


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
def change_password(
    request: Request,
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change your password. Use this after signing in with a temporary
    password from an admin. Signs you out on every other device."""
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "wrong_password", "message": "Your current password is wrong."},
        )
    if body.new_password == body.current_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "same_password", "message": "Choose a password you haven't used here."},
        )
    require_strong_password(body.new_password, current_user.email)
    user = db.get(User, current_user.id)
    user.password_hash = hash_password(body.new_password)
    user.has_password = True
    _revoke_all_sessions(db, user.id)
    audit.record(db, user.id, "auth.password_changed", "user", user.id)
    mailer.send(db, user.email, templates.password_changed(email_codes.display_name(db, user.id)), "password_changed")
    db.commit()


@router.post("/set-password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
def set_password(
    request: Request,
    body: SetPasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a password to an account made with Google, so you can also sign
    in with email and password."""
    user = db.get(User, current_user.id)
    if user.has_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "has_password", "message": "You already have a password. Change it instead."},
        )
    require_strong_password(body.new_password, user.email)
    user.password_hash = hash_password(body.new_password)
    user.has_password = True
    audit.record(db, user.id, "auth.password_set", "user", user.id)
    mailer.send(db, user.email, templates.password_changed(email_codes.display_name(db, user.id)), "password_changed")
    db.commit()


@router.post("/password-reset/request", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("3/minute")
def request_password_reset(request: Request, body: PasswordResetRequest, db: Session = Depends(get_db)):
    """Email a 6-digit code to reset a forgotten password.

    Always answers the same way, whether or not the email has an account.
    """
    password_reset.request_code(db, str(body.email))
    return {"message": "If that email has an account, we've sent a code to it."}


@router.post("/password-reset/confirm", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("10/minute")
def confirm_password_reset(request: Request, body: PasswordResetConfirm, db: Session = Depends(get_db)):
    """Set a new password with the emailed code. Signs out everywhere."""
    require_strong_password(body.new_password, str(body.email))
    password_reset.reset_password(db, str(body.email), body.code, body.new_password)


@router.post("/delete-account", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
def delete_my_account(
    request: Request,
    body: DeleteAccountRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Permanently delete your account. Confirm with your password, or with
    Google if your account has no password.

    Your name, email, photo and details are wiped and you're signed out
    everywhere. Posts and comments stay, shown as "Deleted user".
    """
    if body.password:
        confirmed = verify_password(body.password, current_user.password_hash)
        if not confirmed:
            raise InvalidInput("wrong_password", "Your password is wrong.")
    elif body.google_id_token and current_user.google_sub:
        try:
            identity = google_auth.verify_id_token(body.google_id_token)
        except google_auth.GoogleSignInOff:
            raise InvalidInput("google_off", "Google sign-in isn't set up.") from None
        if identity.sub != current_user.google_sub:
            raise InvalidInput("google_mismatch", "That's a different Google account.")
    else:
        raise InvalidInput("confirm_required", "Confirm with your password or Google.")
    email, name = current_user.email, email_codes.display_name(db, current_user.id)
    account.delete_account(db, current_user.id, password=None)
    mailer.send(db, email, templates.account_deleted(name), "account_deleted")
    db.commit()
