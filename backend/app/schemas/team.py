"""Schemas for managing the team: platform Admins and Chapter Coordinators."""

from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, StringConstraints, model_validator

from app.models.chapter_management import ChapterStaffRole
from app.models.user import AccountRole
from app.schemas.common import UtcDatetime

DisplayName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=50)]


class NewAccount(BaseModel):
    """A brand-new account. The API generates a temporary password and
    returns it once, for the admin to pass on."""

    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    display_name: DisplayName


class PersonChoice(BaseModel):
    """Exactly one of: an existing user, or a new account."""

    model_config = ConfigDict(extra="forbid")

    user_id: UUID | None = None
    new_account: NewAccount | None = None

    @model_validator(mode="after")
    def _exactly_one(self):
        if (self.user_id is None) == (self.new_account is None):
            raise ValueError("Send either user_id or new_account, not both")
        return self


class CoordinatorCreate(PersonChoice):
    """Make someone the Coordinator of a Chapter.

    They become an official Member of that Chapter too (moving them from
    any other Chapter). If the Chapter already has a Coordinator, send
    ``replace_current`` to take over; the current one stays a Member.
    """

    chapter_id: UUID
    replace_current: bool = False


class AdminCreate(PersonChoice):
    """Give someone an app-wide role: Admin or app Moderator."""

    account_role: AccountRole = AccountRole.ADMIN

    @model_validator(mode="after")
    def _staff_role(self):
        if self.account_role == AccountRole.USER:
            raise ValueError("account_role must be admin or moderator")
        return self


class TeamPerson(BaseModel):
    user_id: UUID
    email: str
    display_name: str | None
    avatar_url: str | None
    is_active: bool
    last_login_at: UtcDatetime | None


class PlatformStaffRead(TeamPerson):
    account_role: AccountRole
    created_at: UtcDatetime


class ChapterStaffEntry(TeamPerson):
    id: UUID
    chapter_id: UUID
    chapter_name: str
    chapter_active: bool
    role: ChapterStaffRole
    assigned_at: UtcDatetime


class TeamRead(BaseModel):
    platform: list[PlatformStaffRead]
    chapter_staff: list[ChapterStaffEntry]


class TeamChangeResult(BaseModel):
    """What changed. ``temporary_password`` is only set when a new account
    was created, and is shown this once."""

    user_id: UUID
    email: str
    display_name: str | None
    temporary_password: str | None = None
    replaced_user_id: UUID | None = None
