"""Platform-admin Chapter membership assignment schemas."""

from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ChapterAssignmentUpdate(BaseModel):
    """Legacy schema retained temporarily for compatibility."""

    model_config = ConfigDict(extra="forbid")
    branch_id: UUID | None


class MemberAssignmentCreate(BaseModel):
    """Atomically convert or reassign a user as an official Member."""

    model_config = ConfigDict(extra="forbid")

    branch_id: UUID
    department_id: UUID