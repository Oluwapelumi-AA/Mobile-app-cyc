"""Platform-admin Chapter membership assignment schemas."""

from uuid import UUID

from pydantic import BaseModel, ConfigDict


class MemberAssignmentCreate(BaseModel):
    """Atomically convert or reassign a user as an official Member."""

    model_config = ConfigDict(extra="forbid")

    chapter_id: UUID
    # Optional: Members can also choose their own department.
    department_id: UUID | None = None
