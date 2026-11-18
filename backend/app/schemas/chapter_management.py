"""Schemas for Chapter staff, members, announcements and global departments."""

from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.models.chapter_management import ChapterStaffRole
from app.schemas.common import UtcDatetime

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=100)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]
AnnouncementTitle = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)
]
AnnouncementBody = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)
]


# Staff (Coordinators and Moderators)


class StaffAssign(BaseModel):
    """Give someone a staff role in a Chapter (platform Admins only)."""

    model_config = ConfigDict(extra="forbid")
    role: ChapterStaffRole


class StaffCreate(BaseModel):
    """Add a Coordinator or Moderator by user id."""

    model_config = ConfigDict(extra="forbid")
    user_id: UUID


class StaffRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    chapter_id: UUID
    user_id: UUID
    role: ChapterStaffRole
    assigned_by: UUID | None
    created_at: UtcDatetime
    email: str | None = None
    display_name: str | None = None


class MyStaffRoleRead(BaseModel):
    chapter_id: UUID
    chapter_name: str
    role: ChapterStaffRole


# Members


class ChapterMemberRead(BaseModel):
    user_id: UUID
    email: str
    display_name: str | None
    avatar_url: str | None
    is_active: bool
    is_verified: bool
    department_id: UUID | None = None
    department_name: str | None = None
    # coordinator, moderator or null.
    staff_role: ChapterStaffRole | None = None
    is_banned: bool = False
    joined_at: UtcDatetime


class DepartmentMemberRead(BaseModel):
    user_id: UUID
    email: str
    display_name: str | None
    department_id: UUID | None
    department_name: str | None


# Announcements and dashboard


class AnnouncementCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: AnnouncementTitle
    body: AnnouncementBody


class AnnouncementResult(BaseModel):
    chapter_id: UUID
    recipients: int


class ChapterDashboard(BaseModel):
    chapter_id: UUID
    chapter_name: str
    is_active: bool
    member_count: int
    coordinator_count: int
    moderator_count: int
    post_count: int
    upcoming_event_count: int
    published_resource_count: int
    open_report_count: int
    pending_access_request_count: int
    ban_count: int
    my_role: str | None
    is_platform_admin: bool


# Departments (global)


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
    # Official Members assigned to this department, across all Chapters.
    member_count: int = 0


class DepartmentAssignmentUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    department_id: UUID | None
