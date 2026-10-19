import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import Uuid

from app.db.session import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Branch(Base):
    """A local CYC branch (chapter), e.g. CYC Lagos or CYC London.

    Members pick a home branch on their profile and communities can belong to
    one. Branches are managed by app admins.
    """

    __tablename__ = "branches"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    # ISO 3166-1 alpha-2, e.g. "NG".
    country_code: Mapped[str] = mapped_column(String(2), nullable=False, index=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # IANA time zone, e.g. "Africa/Lagos".
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    # BCP 47 tag of the language the branch mostly uses, e.g. "en" or "fr".
    language_code: Mapped[str | None] = mapped_column(String(35), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    # Archived branches stay on profiles and communities but can't be picked.
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
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
