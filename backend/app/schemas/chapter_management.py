"""Schemas for chapter coordinators, chapter members, and global departments."""
from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.schemas.common import UtcDatetime

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=100)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]


class CoordinatorCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: UUID


class CoordinatorRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    branch_id: UUID
    user_id: UUID
    assigned_by: UUID | None
    created_at: UtcDatetime


class ChapterMemberRead(BaseModel):
    user_id: UUID
    email: str
    display_name: str | None
    avatar_url: str | None
    is_active: bool
    is_verified: bool
    joined_at: UtcDatetime


class DepartmentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Name
    description: Description | None = None


class DepartmentUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Name | None = None
    description: Description | None = None


class DepartmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    description: str | None
    created_by: UUID | None
    created_at: UtcDatetime
    updated_at: UtcDatetime


class DepartmentAssignmentUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    department_id: UUID | None


class DepartmentMemberRead(BaseModel):
    user_id: UUID
    email: str
    display_name: str | None
    department_id: UUID | None
    department_name: str | None
