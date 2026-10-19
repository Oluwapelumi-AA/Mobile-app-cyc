"""CYC branch endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_id
from app.core.identity import UserId
from app.db.session import get_db
from app.schemas.branch import BranchCreate, BranchRead, BranchUpdate
from app.services import branches

router = APIRouter(prefix="/branches", tags=["Branches"])

CurrentUserId = Annotated[UserId, Depends(get_current_user_id)]
DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=list[BranchRead])
def list_branches(
    user_id: CurrentUserId,
    db: DbSession,
    q: Annotated[str | None, Query(max_length=100)] = None,
    country_code: Annotated[str | None, Query(min_length=2, max_length=2)] = None,
    include_archived: bool = False,
):
    """By country, then name. ``include_archived`` is for app staff."""
    return branches.list_branches(
        db, user_id, q=q, country_code=country_code, include_archived=include_archived
    )


@router.post("", response_model=BranchRead, status_code=status.HTTP_201_CREATED)
def create_branch(data: BranchCreate, user_id: CurrentUserId, db: DbSession):
    """App admins only."""
    return branches.create_branch(db, user_id, data)


@router.get("/{branch_id}", response_model=BranchRead)
def get_branch(branch_id: UUID, user_id: CurrentUserId, db: DbSession):
    return branches.get_branch(db, user_id, branch_id)


@router.patch("/{branch_id}", response_model=BranchRead)
def update_branch(branch_id: UUID, data: BranchUpdate, user_id: CurrentUserId, db: DbSession):
    """App admins only."""
    return branches.update_branch(db, user_id, branch_id, data)


@router.post("/{branch_id}/archive", response_model=BranchRead)
def archive_branch(branch_id: UUID, user_id: CurrentUserId, db: DbSession):
    """App admins only. Members and communities keep it; nobody new can pick it."""
    return branches.set_archived(db, user_id, branch_id, archived=True)


@router.post("/{branch_id}/restore", response_model=BranchRead)
def restore_branch(branch_id: UUID, user_id: CurrentUserId, db: DbSession):
    """App admins only."""
    return branches.set_archived(db, user_id, branch_id, archived=False)


@router.put("/{branch_id}/membership", response_model=BranchRead)
def join_branch(branch_id: UUID, user_id: CurrentUserId, db: DbSession):
    """Make this your home branch (replacing any other)."""
    return branches.join_branch(db, user_id, branch_id)


@router.delete("/{branch_id}/membership", status_code=status.HTTP_204_NO_CONTENT)
def leave_branch(branch_id: UUID, user_id: CurrentUserId, db: DbSession):
    branches.leave_branch(db, user_id, branch_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
