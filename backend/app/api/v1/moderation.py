"""Reporting, the moderation queue, community bans and the audit log."""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_id
from app.core.identity import UserId
from app.db.session import get_db
from app.models.moderation import ReportStatus, ReportTarget
from app.schemas.common import Page
from app.schemas.moderation import (
    AuditLogRead,
    BanCreate,
    BanRead,
    MyReportRead,
    ReportCreate,
    ReportRead,
    ReportResolve,
)
from app.services import audit, moderation
from app.services.pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE

router = APIRouter(tags=["Moderation"])

CurrentUserId = Annotated[UserId, Depends(get_current_user_id)]
DbSession = Annotated[Session, Depends(get_db)]
Limit = Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)]
Cursor = Annotated[str | None, Query(max_length=200)]


# Reporting


@router.post("/reports", response_model=MyReportRead, status_code=status.HTTP_201_CREATED)
def create_report(data: ReportCreate, user_id: CurrentUserId, db: DbSession):
    """Report a post, comment, event, resource, community or user."""
    return moderation.create_report(db, user_id, data)


@router.get("/reports/mine", response_model=Page[MyReportRead])
def list_my_reports(
    user_id: CurrentUserId,
    db: DbSession,
    limit: Limit = DEFAULT_PAGE_SIZE,
    cursor: Cursor = None,
):
    """Your reports and whether they were reviewed, newest first."""
    items, next_cursor = moderation.list_my_reports(db, user_id, limit, cursor)
    return Page(items=items, next_cursor=next_cursor)


# The moderation queue


@router.get("/moderation/reports", response_model=Page[ReportRead])
def list_reports(
    user_id: CurrentUserId,
    db: DbSession,
    limit: Limit = DEFAULT_PAGE_SIZE,
    cursor: Cursor = None,
    status: Literal["open", "actioned", "dismissed", "any"] = "open",
    target_type: ReportTarget | None = None,
    community_id: UUID | None = None,
    app_wide: bool = False,
):
    """Reports you can review. Open ones oldest first, others newest first.

    Community moderators see their communities' reports; app moderators and
    admins see all, and ``app_wide=true`` shows only those for app staff.
    """
    items, next_cursor = moderation.list_reports(
        db,
        user_id,
        limit,
        cursor,
        status=None if status == "any" else ReportStatus(status),
        target_type=target_type,
        community_id=community_id,
        app_wide=app_wide,
    )
    return Page(items=items, next_cursor=next_cursor)


@router.get("/moderation/reports/{report_id}", response_model=ReportRead)
def get_report(report_id: UUID, user_id: CurrentUserId, db: DbSession):
    return moderation.get_report(db, user_id, report_id)


@router.post("/moderation/reports/{report_id}/resolve", response_model=ReportRead)
def resolve_report(
    report_id: UUID, data: ReportResolve, user_id: CurrentUserId, db: DbSession
):
    """Close this report and every other open report about the same thing."""
    return moderation.resolve_report(db, user_id, report_id, data)


# The audit log


@router.get("/moderation/audit-logs", response_model=Page[AuditLogRead])
def list_audit_logs(
    user_id: CurrentUserId,
    db: DbSession,
    limit: Limit = DEFAULT_PAGE_SIZE,
    cursor: Cursor = None,
    community_id: UUID | None = None,
    actor_id: UUID | None = None,
    action: Annotated[str | None, Query(max_length=50)] = None,
    target_type: Annotated[str | None, Query(max_length=20)] = None,
    target_id: UUID | None = None,
):
    """Newest first. Community moderators must pass their ``community_id``."""
    items, next_cursor = audit.list_entries(
        db,
        user_id,
        limit,
        cursor,
        community_id=community_id,
        actor_id=actor_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
    )
    return Page(items=items, next_cursor=next_cursor)


# Community bans


@router.get("/communities/{community_id}/bans", response_model=Page[BanRead])
def list_bans(
    community_id: UUID,
    user_id: CurrentUserId,
    db: DbSession,
    limit: Limit = DEFAULT_PAGE_SIZE,
    cursor: Cursor = None,
):
    items, next_cursor = moderation.list_bans(db, user_id, community_id, limit, cursor)
    return Page(items=items, next_cursor=next_cursor)


@router.put(
    "/communities/{community_id}/bans/{target_user_id}",
    response_model=BanRead,
    status_code=status.HTTP_201_CREATED,
)
def ban_member(
    community_id: UUID,
    target_user_id: UUID,
    user_id: CurrentUserId,
    db: DbSession,
    data: BanCreate | None = None,
):
    """Remove someone from the community and stop them joining again."""
    return moderation.ban_member(db, user_id, community_id, target_user_id, data or BanCreate())


@router.delete(
    "/communities/{community_id}/bans/{target_user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def unban_member(
    community_id: UUID, target_user_id: UUID, user_id: CurrentUserId, db: DbSession
):
    moderation.unban_member(db, user_id, community_id, target_user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
