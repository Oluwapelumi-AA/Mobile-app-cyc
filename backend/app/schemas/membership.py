"""Schemas for joining a Chapter and choosing a department."""

from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.user import MembershipStatus


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
