"""Platform-admin Chapter membership assignment schemas."""

from uuid import UUID

from pydantic import BaseModel, ConfigDict


class MemberAssignmentCreate(BaseModel):
    """Atomically convert or reassign a user as an official Member."""

    model_config = ConfigDict(extra="forbid")

    chapter_id: UUID
    department_id: UUID
