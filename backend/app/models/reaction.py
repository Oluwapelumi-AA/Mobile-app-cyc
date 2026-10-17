import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import Uuid

from app.db.session import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Reaction(Base):
    __tablename__ = "reactions"

    __table_args__ = (
        CheckConstraint(
            "target_type IN ('post', 'comment')",
            name="ck_reactions_target_type",
        ),
        CheckConstraint(
            "reaction_type IN "
            "('like', 'love', 'pray', 'celebrate', 'encourage')",
            name="ck_reactions_reaction_type",
        ),
        UniqueConstraint(
            "user_id",
            "target_type",
            "target_id",
            name="uq_reactions_user_target",
        ),
        Index(
            "ix_reactions_target",
            "target_type",
            "target_id",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    target_type: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
    )

    target_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        nullable=False,
    )

    reaction_type: Mapped[str] = mapped_column(
        String(20),
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
