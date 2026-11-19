"""Schemas for joining a Chapter and choosing a department."""

from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.chapter_management import ChapterStaffRole
from app.models.user import AccountRole, MembershipStatus
from app.schemas.common import UtcDatetime


class ChapterChoice(BaseModel):
    model_config = ConfigDict(extra="forbid")

    chapter_id: UUID


class DepartmentChoice(BaseModel):
    model_config = ConfigDict(extra="forbid")

    department_id: UUID


class MyMembershipRead(BaseModel):
    """Where you belong.

    ``preferred_chapter_id`` is the Chapter picked during onboarding. You
    become an official Member of it, with no approval needed, as soon as
    onboarding is complete.
    """

    membership_status: MembershipStatus
    chapter_id: UUID | None
    chapter_name: str | None
    preferred_chapter_id: UUID | None
    department_id: UUID | None
    department_name: str | None
    onboarding_complete: bool


class DepartmentMemberRead(BaseModel):
    user_id: UUID
    email: str
    display_name: str | None
    avatar_url: str | None
    chapter_id: UUID | None
    chapter_name: str | None


class StaffRole(BaseModel):
    chapter_id: UUID
    chapter_name: str
    role: ChapterStaffRole


class PublicProfileRead(BaseModel):
    """What any signed-in user can see about someone else."""

    user_id: UUID
    display_name: str
    avatar_url: str | None
    bio: str | None
    membership_status: MembershipStatus
    chapter_id: UUID | None
    chapter_name: str | None
    department_name: str | None
    # App-wide role, shown as a badge; "user" for everyone else.
    account_role: AccountRole
    staff_roles: list[StaffRole]
    is_deleted: bool
    member_since: UtcDatetime
