import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)


class SetPasswordRequest(BaseModel):
    new_password: str = Field(min_length=12, max_length=128)


class DeleteAccountRequest(BaseModel):
    """Confirm with your password, or (for Google-only accounts) a fresh
    Google ID token."""

    password: str | None = Field(default=None, min_length=1, max_length=128)
    google_id_token: str | None = Field(default=None, min_length=10, max_length=4096)


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
    new_password: str = Field(min_length=12, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class GoogleSignInRequest(BaseModel):
    id_token: str = Field(min_length=10, max_length=4096)


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class ResendCodeRequest(BaseModel):
    email: EmailStr


class MfaCodeRequest(BaseModel):
    """An authenticator code (6 digits) or a recovery code (xxxxx-xxxxx).
    ``mfa_token`` comes from the sign-in step; leave it out when signed in."""

    code: str = Field(min_length=6, max_length=20)
    mfa_token: str | None = Field(default=None, max_length=2048)


class MfaSetupRequest(BaseModel):
    mfa_token: str | None = Field(default=None, max_length=2048)


class MfaSetupResponse(BaseModel):
    secret: str
    otpauth_uri: str


class MfaStatus(BaseModel):
    enabled: bool
    required: bool
    recovery_codes_left: int


class RecoveryCodesResponse(BaseModel):
    recovery_codes: list[str]


class UserResponse(BaseModel):
    id: uuid.UUID
    email: EmailStr
    is_active: bool
    is_verified: bool
    account_role: str
    created_at: datetime
    has_password: bool = True
    google_linked: bool = False
    mfa_enabled: bool = False
    mfa_required: bool = False

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    """Sign-in result. Usually the two tokens. When two-step sign-in is on,
    ``mfa_required`` is true and ``mfa_token`` must be sent with the code to
    ``/auth/mfa/verify``. Admins who haven't set it up yet get
    ``mfa_setup_required`` and use ``mfa_token`` with ``/auth/mfa/setup``
    and ``/auth/mfa/enable``."""

    access_token: str | None = None
    refresh_token: str | None = None
    token_type: str = "bearer"
    mfa_required: bool = False
    mfa_setup_required: bool = False
    mfa_token: str | None = None
    # Google sign-in: a brand-new account (finish the profile), and the
    # name Google gave us to fill it in.
    is_new_account: bool = False
    suggested_name: str | None = None


class MfaEnableResponse(TokenResponse):
    recovery_codes: list[str]


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class LogoutRequest(BaseModel):
    refresh_token: str = Field(min_length=1)
