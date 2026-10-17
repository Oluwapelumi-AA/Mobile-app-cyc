"""Request and response schemas for posts and comments."""

from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.schemas.common import UtcDatetime

PostBody = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)
]
CommentBody = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)
]


class PostCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    body: PostBody


class PostUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    body: PostBody


class PostRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    community_id: UUID
    author_id: UUID
    body: str
    comment_count: int
    created_at: UtcDatetime
    updated_at: UtcDatetime
    edited_at: UtcDatetime | None


class CommentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    body: CommentBody


class CommentUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    body: CommentBody


class CommentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    post_id: UUID
    author_id: UUID
    body: str
    created_at: UtcDatetime
    updated_at: UtcDatetime
    edited_at: UtcDatetime | None
