
"""Schemas for Chapter access requests."""

from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import UtcDatetime


class ChapterAccessRequestStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    DECLINED = "declined"
    CANCELLED = "cancelled"


class ChapterAccessRequestCreate(BaseModel):
    """A user requests access to a Chapter."""

    model_config = ConfigDict(extra="forbid")

    chapter_id: UUID


class ChapterAccessRequestReview(BaseModel):
    """A Chapter Coordinator reviews a pending access request."""

    model_config = ConfigDict(extra="forbid")

    status: ChapterAccessRequestStatus


class ChapterAccessRequestRead(BaseModel):
    """Chapter access request details."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    chapter_id: UUID
    user_id: UUID
    status: ChapterAccessRequestStatus
    reviewed_by: UUID | None
    reviewed_at: UtcDatetime | None
    created_at: UtcDatetime
    updated_at: UtcDatetime
