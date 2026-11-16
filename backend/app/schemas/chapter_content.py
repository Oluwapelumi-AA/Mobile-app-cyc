"""Chapter-only content API schemas."""
from datetime import datetime
from uuid import UUID
from typing import Annotated
from pydantic import BaseModel, ConfigDict, StringConstraints

Body = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=10000)]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]

class ChapterPostCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    body: Body

class ChapterPostRead(BaseModel):
    id: UUID
    branch_id: UUID
    author_id: UUID
    body: str
    created_at: datetime
    updated_at: datetime

class ChapterCommentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    body: Body

class ChapterCommentRead(BaseModel):
    id: UUID
    post_id: UUID
    author_id: UUID
    body: str
    created_at: datetime

class ChapterBroadcastCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: Title
    body: Body
