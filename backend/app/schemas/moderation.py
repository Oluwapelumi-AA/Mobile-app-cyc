"""Request and response schemas for reports, moderation, bans, the audit
log and admin user tools."""

from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, StringConstraints, model_validator

from app.models.moderation import ReportReason, ReportStatus, ReportTarget
from app.models.user import AccountRole
from app.schemas.common import UtcDatetime

Note = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]
Reason = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]


def _empty_to_none(model: BaseModel, *fields: str) -> None:
    for name in fields:
        if getattr(model, name) == "":
            setattr(model, name, None)


# Reports


class ReportCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_type: ReportTarget
    target_id: UUID
    reason: ReportReason
    details: Note | None = None

    @model_validator(mode="after")
    def _clean(self):
        _empty_to_none(self, "details")
        return self


class MyReportRead(BaseModel):
    """What the person who reported something sees."""

    id: UUID
    target_type: ReportTarget
    target_id: UUID
    reason: ReportReason
    details: str | None
    status: ReportStatus
    created_at: UtcDatetime
    reviewed_at: UtcDatetime | None


class ReportRead(MyReportRead):
    """What moderators see."""

    reporter_id: UUID | None
    target_owner_id: UUID | None
    community_id: UUID | None
    snapshot: dict
    # Whether the reported thing still exists.
    target_exists: bool
    # Open reports about the same thing, this one included.
    open_reports_on_target: int
    reviewed_by: UUID | None
    resolution_note: str | None
    content_removed: bool
    updated_at: UtcDatetime


class ReportResolve(BaseModel):
    """Close a report, and every other open report about the same thing.

    ``remove_content`` deletes a reported post or comment; it needs
    ``status: actioned``.
    """

    model_config = ConfigDict(extra="forbid")

    status: ReportStatus
    note: Note | None = None
    remove_content: bool = False

    @model_validator(mode="after")
    def _check(self):
        _empty_to_none(self, "note")
        if self.status == ReportStatus.OPEN:
            raise ValueError("status must be actioned or dismissed")
        if self.remove_content and self.status != ReportStatus.ACTIONED:
            raise ValueError("remove_content needs status actioned")
        return self


# Community bans


class BanCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: Reason | None = None

    @model_validator(mode="after")
    def _clean(self):
        _empty_to_none(self, "reason")
        return self


class BanRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    community_id: UUID
    user_id: UUID
    banned_by: UUID | None
    reason: str | None
    created_at: UtcDatetime


# Audit log


class AuditLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    actor_id: UUID | None
    action: str
    target_type: str
    target_id: UUID
    community_id: UUID | None
    data: dict
    created_at: UtcDatetime


# Admin: users


class AdminUserRead(BaseModel):
    id: UUID
    email: str
    display_name: str | None
    avatar_url: str | None
    account_role: AccountRole
    is_active: bool
    is_verified: bool
    branch_id: UUID | None
    # Open reports about this user or what they wrote.
    open_reports: int
    created_at: UtcDatetime
    last_login_at: UtcDatetime | None


class AccountRoleUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    account_role: AccountRole


class SuspendRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: Reason

    @model_validator(mode="after")
    def _check(self):
        if not self.reason:
            raise ValueError("reason is required")
        return self


class ReinstateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    note: Reason | None = None


class AdminOverview(BaseModel):
    """Headline numbers for the admin dashboard."""

    users: int
    active_users: int
    inactive_users: int
    new_users_last_7_days: int
    communities: int
    posts_last_7_days: int
    open_reports: int
    upcoming_events: int
    branches: int
