"""Request and response schemas for reactions."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


ReactionType = Literal[
    "like",
    "love",
    "pray",
    "celebrate",
    "encourage",
]

ReactionTargetType = Literal["post", "comment"]


class ReactionCreate(BaseModel):
    """Request body for adding or changing a reaction."""

    model_config = ConfigDict(extra="forbid")

    reaction_type: ReactionType


class ReactionRead(BaseModel):
    """Reaction returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    target_type: ReactionTargetType
    target_id: UUID
    reaction_type: ReactionType
    created_at: datetime
    updated_at: datetime
