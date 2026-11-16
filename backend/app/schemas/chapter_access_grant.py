
"""Schemas for selective Chapter content access grants."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.common import UtcDatetime


class ChapterAccessGrantItemCreate(BaseModel):
    """One Chapter content item selected for Guest access."""

    model_config = ConfigDict(extra="forbid")

    chapter_post_id: UUID | None = None
    event_id: UUID | None = None
    meeting_id: UUID | None = None
    resource_id: UUID | None = None

    @model_validator(mode="after")
    def validate_exactly_one_target(self):
        targets = (
            self.chapter_post_id,
            self.event_id,
            self.meeting_id,
            self.resource_id,
        )

        if sum(value is not None for value in targets) != 1:
            raise ValueError(
                "Exactly one Chapter content item must be selected."
            )

        return self


class ChapterAccessGrantCreate(BaseModel):
    """Create or extend a Guest's selective Chapter content access."""

    model_config = ConfigDict(extra="forbid")

    user_id: UUID
    items: list[ChapterAccessGrantItemCreate] = Field(
        min_length=1,
        max_length=100,
    )

    @model_validator(mode="after")
    def validate_unique_items(self):
        targets = [
            (
                item.chapter_post_id,
                item.event_id,
                item.meeting_id,
                item.resource_id,
            )
            for item in self.items
        ]

        if len(targets) != len(set(targets)):
            raise ValueError("Duplicate content items are not allowed.")

        return self


class ChapterAccessGrantItemRead(BaseModel):
    """One content item included in a Guest access grant."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    grant_id: UUID
    chapter_post_id: UUID | None
    post_id: UUID | None
    event_id: UUID | None
    meeting_id: UUID | None
    resource_id: UUID | None
    created_at: UtcDatetime


class ChapterAccessGrantRead(BaseModel):
    """A Guest's selective access to a Chapter."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    chapter_id: UUID
    user_id: UUID
    granted_by: UUID | None
    created_at: UtcDatetime
    items: list[ChapterAccessGrantItemRead] = Field(default_factory=list)
