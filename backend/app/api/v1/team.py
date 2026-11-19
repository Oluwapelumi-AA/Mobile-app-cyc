"""Admins only: platform Admins, app Moderators and Chapter Coordinators."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_id
from app.core.identity import UserId
from app.db.session import get_db
from app.schemas.team import AdminCreate, CoordinatorCreate, TeamChangeResult, TeamRead
from app.services import team

router = APIRouter(prefix="/admin", tags=["Team"])

CurrentUserId = Annotated[UserId, Depends(get_current_user_id)]
DbSession = Annotated[Session, Depends(get_db)]


@router.get("/team", response_model=TeamRead)
def get_team(user_id: CurrentUserId, db: DbSession):
    """Everyone with a role: app-wide Admins and Moderators, and each
    Chapter's Coordinator and Moderators."""
    return team.team(db, user_id)


@router.post("/coordinators", response_model=TeamChangeResult, status_code=status.HTTP_201_CREATED)
def add_coordinator(data: CoordinatorCreate, user_id: CurrentUserId, db: DbSession):
    """Make an existing user, or a new account, the Coordinator of a Chapter.

    A new account gets a temporary password, returned once in
    ``temporary_password``; they should change it after signing in.
    """
    return team.add_coordinator(db, user_id, data)


@router.delete("/coordinators/{chapter_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_coordinator(chapter_id: UUID, user_id: CurrentUserId, db: DbSession):
    """Remove the Chapter's Coordinator. They stay a Member."""
    team.remove_coordinator(db, user_id, chapter_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/platform-staff", response_model=TeamChangeResult, status_code=status.HTTP_201_CREATED)
def add_platform_staff(data: AdminCreate, user_id: CurrentUserId, db: DbSession):
    """Make an existing user, or a new account, an Admin or app Moderator."""
    return team.add_platform_staff(db, user_id, data)


@router.delete("/platform-staff/{target_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_platform_staff(target_id: UUID, user_id: CurrentUserId, db: DbSession):
    team.remove_platform_staff(db, user_id, target_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/users/{target_id}/temporary-password", response_model=TeamChangeResult)
def reset_password(target_id: UUID, user_id: CurrentUserId, db: DbSession):
    """Set a new temporary password, returned once, and sign them out."""
    return team.reset_password(db, user_id, target_id)
