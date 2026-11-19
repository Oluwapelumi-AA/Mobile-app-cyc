"""Joining a Chapter and choosing a department."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_id
from app.core.identity import UserId
from app.db.session import get_db
from app.schemas.home import HomeRead
from app.schemas.membership import (
    ChapterChoice,
    DepartmentChoice,
    DepartmentMemberRead,
    MyMembershipRead,
    PublicProfileRead,
)
from app.services import home, membership

router = APIRouter(tags=["Membership"])

CurrentUserId = Annotated[UserId, Depends(get_current_user_id)]
DbSession = Annotated[Session, Depends(get_db)]


@router.get("/me/home", response_model=HomeRead)
def get_home(user_id: CurrentUserId, db: DbSession):
    """The app's home screen in one request: your Chapter, unread count,
    live sessions, upcoming events, recent Chapter posts, new resources and
    courses to continue."""
    return home.home(db, user_id)


@router.get("/me/membership", response_model=MyMembershipRead)
def get_my_membership(user_id: CurrentUserId, db: DbSession):
    """Your Chapter and department."""
    return membership.my_membership(db, user_id)


@router.put("/me/chapter", response_model=MyMembershipRead)
def choose_chapter(data: ChapterChoice, user_id: CurrentUserId, db: DbSession):
    """Pick your Chapter. No approval needed.

    During onboarding this records your choice, and you become a Member when
    onboarding is complete. If you finished onboarding without one, this
    joins the Chapter at once. Once you're a Member you can't leave or switch
    Chapters (409 ``already_in_a_chapter``); only an Admin can move you.
    """
    return membership.choose_chapter(db, user_id, data.chapter_id)


@router.put("/me/department", response_model=MyMembershipRead)
def join_department(data: DepartmentChoice, user_id: CurrentUserId, db: DbSession):
    """Join a department, leaving your current one. Members only."""
    return membership.join_department(db, user_id, data.department_id)


@router.delete("/me/department", response_model=MyMembershipRead)
def leave_department(user_id: CurrentUserId, db: DbSession):
    return membership.leave_department(db, user_id)


@router.get("/departments/{department_id}/members", response_model=list[DepartmentMemberRead])
def list_department_members(department_id: UUID, user_id: CurrentUserId, db: DbSession):
    """Admins only."""
    return membership.list_department_members(db, user_id, department_id)


@router.put("/departments/{department_id}/members/{target_id}", status_code=status.HTTP_204_NO_CONTENT)
def add_department_member(
    department_id: UUID, target_id: UUID, user_id: CurrentUserId, db: DbSession
):
    """Admins only. Moves the Member out of any other department."""
    membership.add_to_department(db, user_id, department_id, target_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/departments/{department_id}/members/{target_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_department_member(
    department_id: UUID, target_id: UUID, user_id: CurrentUserId, db: DbSession
):
    """Admins only."""
    membership.remove_from_department(db, user_id, department_id, target_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/profiles/{target_id}", response_model=PublicProfileRead)
def get_public_profile(target_id: UUID, user_id: CurrentUserId, db: DbSession):
    """Someone's public profile: name, photo, bio, Chapter, department and
    roles. For tapping on a name in the app."""
    return membership.public_profile(db, user_id, target_id)
