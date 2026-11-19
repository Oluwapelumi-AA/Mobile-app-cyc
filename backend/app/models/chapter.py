
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import Uuid

from app.db.session import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Chapter(Base):
    """A regional CYC Chapter, such as Nigeria, Ireland or Cameroon.

    Chapters are the only grouping in the app: official Members belong to
    one Chapter (``user_profiles.chapter_id``), and posts, events, meetings,
    resources, bans and reports are scoped to a Chapter. Geographic coverage
    is managed separately through ChapterCoverageArea.
    """

    __tablename__ = "chapters"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    country_code: Mapped[str] = mapped_column(String(2), nullable=False, index=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    language_code: Mapped[str | None] = mapped_column(String(35), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    # Where and when the Chapter meets, shown on its page in the app.
    state: Mapped[str | None] = mapped_column(String(100), nullable=True)
    venue: Mapped[str | None] = mapped_column(String(150), nullable=True)
    address: Mapped[str | None] = mapped_column(String(300), nullable=True)
    meeting_schedule: Mapped[str | None] = mapped_column(String(150), nullable=True)
    meeting_time: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # For "chapters near you"; optional.
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
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

