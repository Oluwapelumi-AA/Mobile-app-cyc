"""Community, membership and community feed endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_id
from app.core.identity import UserId
from app.db.session import get_db
from app.schemas.common import Page
from app.schemas.community import (
    CommunityCreate,
    CommunityRead,
    CommunityUpdate,
    MemberRoleUpdate,
    MembershipRead,
)
from app.schemas.post import PostCreate, PostRead
from app.services import communities, posts
from app.services.pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE

router = APIRouter(prefix="/communities", tags=["Communities"])

CurrentUserId = Annotated[UserId, Depends(get_current_user_id)]
DbSession = Annotated[Session, Depends(get_db)]
Limit = Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)]
Cursor = Annotated[str | None, Query(max_length=200)]


@router.post("", response_model=CommunityRead, status_code=status.HTTP_201_CREATED)
def create_community(data: CommunityCreate, user_id: CurrentUserId, db: DbSession):
    return communities.create_community(db, user_id, data)


@router.get("", response_model=Page[CommunityRead])
def list_communities(
    user_id: CurrentUserId,
    db: DbSession,
    limit: Limit = DEFAULT_PAGE_SIZE,
    cursor: Cursor = None,
    mine: bool = False,
    branch_id: UUID | None = None,
):
    """Newest first. ``mine=true`` lists only communities you belong to;
    ``branch_id`` only one branch's."""
    items, next_cursor = communities.list_communities(
        db, user_id, limit, cursor, mine, branch_id
    )
    return Page(items=items, next_cursor=next_cursor)


@router.get("/{community_id}", response_model=CommunityRead)
def get_community(community_id: UUID, user_id: CurrentUserId, db: DbSession):
    community, membership = communities.get_visible_community(db, community_id, user_id)
    return communities.to_read(db, community, membership)


@router.patch("/{community_id}", response_model=CommunityRead)
def update_community(
    community_id: UUID, data: CommunityUpdate, user_id: CurrentUserId, db: DbSession
):
    return communities.update_community(db, user_id, community_id, data)


@router.delete("/{community_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_community(community_id: UUID, user_id: CurrentUserId, db: DbSession):
    communities.delete_community(db, user_id, community_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{community_id}/join",
    response_model=MembershipRead,
    status_code=status.HTTP_201_CREATED,
)
def join_community(community_id: UUID, user_id: CurrentUserId, db: DbSession):
    return communities.join_community(db, user_id, community_id)


@router.post("/{community_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
def leave_community(community_id: UUID, user_id: CurrentUserId, db: DbSession):
    communities.leave_community(db, user_id, community_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{community_id}/members", response_model=Page[MembershipRead])
def list_members(
    community_id: UUID,
    user_id: CurrentUserId,
    db: DbSession,
    limit: Limit = DEFAULT_PAGE_SIZE,
    cursor: Cursor = None,
):
    """Members in the order they joined."""
    items, next_cursor = communities.list_members(db, user_id, community_id, limit, cursor)
    return Page(items=items, next_cursor=next_cursor)


@router.patch("/{community_id}/members/{member_user_id}", response_model=MembershipRead)
def change_member_role(
    community_id: UUID,
    member_user_id: UUID,
    data: MemberRoleUpdate,
    user_id: CurrentUserId,
    db: DbSession,
):
    return communities.change_member_role(db, user_id, community_id, member_user_id, data.role)


@router.delete(
    "/{community_id}/members/{member_user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_member(
    community_id: UUID, member_user_id: UUID, user_id: CurrentUserId, db: DbSession
):
    communities.remove_member(db, user_id, community_id, member_user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{community_id}/posts",
    response_model=PostRead,
    status_code=status.HTTP_201_CREATED,
)
def create_post(
    community_id: UUID, data: PostCreate, user_id: CurrentUserId, db: DbSession
):
    return posts.create_post(db, user_id, community_id, data)


@router.get("/{community_id}/posts", response_model=Page[PostRead])
def community_feed(
    community_id: UUID,
    user_id: CurrentUserId,
    db: DbSession,
    limit: Limit = DEFAULT_PAGE_SIZE,
    cursor: Cursor = None,
):
    """The community's posts, newest first."""
    items, next_cursor = posts.list_feed(db, user_id, community_id, limit, cursor)
    return Page(items=items, next_cursor=next_cursor)
