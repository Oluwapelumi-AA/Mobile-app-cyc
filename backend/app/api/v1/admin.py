"""Admin tools for app moderators and admins."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_id
from app.core.identity import UserId
from app.db.session import get_db
from app.models.user import AccountRole
from app.schemas.common import Page
from app.schemas.moderation import (
    AccountRoleUpdate,
    AdminOverview,
    AdminUserRead,
    ReinstateRequest,
    SuspendRequest,
)
from app.services import admin
from app.services.pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE

router = APIRouter(prefix="/admin", tags=["Admin"])

CurrentUserId = Annotated[UserId, Depends(get_current_user_id)]
DbSession = Annotated[Session, Depends(get_db)]
Limit = Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)]
Cursor = Annotated[str | None, Query(max_length=200)]


@router.get("/overview", response_model=AdminOverview)
def overview(user_id: CurrentUserId, db: DbSession):
    """Headline numbers for the admin dashboard."""
    return admin.overview(db, user_id)


@router.get("/users", response_model=Page[AdminUserRead])
def list_users(
    user_id: CurrentUserId,
    db: DbSession,
    limit: Limit = DEFAULT_PAGE_SIZE,
    cursor: Cursor = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    account_role: AccountRole | None = None,
    is_active: bool | None = None,
    branch_id: UUID | None = None,
):
    """Newest first. ``q`` matches the email or display name."""
    items, next_cursor = admin.list_users(
        db,
        user_id,
        limit,
        cursor,
        q=q,
        account_role=account_role,
        is_active=is_active,
        branch_id=branch_id,
    )
    return Page(items=items, next_cursor=next_cursor)


@router.get("/users/{target_id}", response_model=AdminUserRead)
def get_user(target_id: UUID, user_id: CurrentUserId, db: DbSession):
    return admin.get_user(db, user_id, target_id)


@router.patch("/users/{target_id}/role", response_model=AdminUserRead)
def change_role(
    target_id: UUID, data: AccountRoleUpdate, user_id: CurrentUserId, db: DbSession
):
    """Admins only."""
    return admin.change_role(db, user_id, target_id, data)


@router.post("/users/{target_id}/suspend", response_model=AdminUserRead)
def suspend_user(
    target_id: UUID, data: SuspendRequest, user_id: CurrentUserId, db: DbSession
):
    """Sign them out everywhere and stop them signing in."""
    return admin.suspend_user(db, user_id, target_id, data)


@router.post("/users/{target_id}/reinstate", response_model=AdminUserRead)
def reinstate_user(
    target_id: UUID,
    user_id: CurrentUserId,
    db: DbSession,
    data: ReinstateRequest | None = None,
):
    return admin.reinstate_user(db, user_id, target_id, data or ReinstateRequest())
