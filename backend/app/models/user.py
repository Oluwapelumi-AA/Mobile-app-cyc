
import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import Boolean, DateTime, Enum as SQLAlchemyEnum
from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import Uuid

from app.db.session import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class AccountRole(str, Enum):
    USER = "user"
    MODERATOR = "moderator"
    ADMIN = "admin"


class MembershipStatus(str, Enum):
    GUEST = "guest"
    MEMBER = "member"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    email: Mapped[str] = mapped_column(
        String(320),
        unique=True,
        index=True,
        nullable=False,
    )
    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )
    is_verified: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    account_role: Mapped[AccountRole] = mapped_column(
        SQLAlchemyEnum(
            AccountRole,
            name="account_role_enum",
            native_enum=False,
            create_constraint=True,
            values_callable=lambda enum_cls: [
                role.value for role in enum_cls
            ],
        ),
        default=AccountRole.USER,
        nullable=False,
    )
    membership_status: Mapped[MembershipStatus] = mapped_column(
        SQLAlchemyEnum(
            MembershipStatus,
            name="membership_status_enum",
            native_enum=False,
            create_constraint=True,
            values_callable=lambda enum_cls: [
                status.value for status in enum_cls
            ],
        ),
        default=MembershipStatus.GUEST,
	server_default="guest",
	nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Sign-in methods. Accounts made with Google have no password of their
    # own (``has_password`` false) until they set one.
    has_password: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="1", nullable=False
    )
    google_sub: Mapped[str | None] = mapped_column(
        String(255), unique=True, index=True, nullable=True
    )

    # Wrong passwords in a row, and when a temporary lock ends.
    failed_login_count: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0", nullable=False
    )
    locked_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Two-step sign-in (authenticator app). The secret is stored encrypted;
    # it only counts once ``mfa_enabled_at`` is set.
    mfa_secret: Mapped[str | None] = mapped_column(String(512), nullable=True)
    mfa_enabled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
