"""Post and comment endpoints. Posts are created through /communities."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_id
from app.core.identity import UserId
from app.db.session import get_db
from app.schemas.common import Page
from app.schemas.post import (
    CommentCreate,
    CommentRead,
    CommentUpdate,
    PostRead,
    PostUpdate,
)
from app.services import posts
from app.services.pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE

router = APIRouter(tags=["Posts"])

CurrentUserId = Annotated[UserId, Depends(get_current_user_id)]
DbSession = Annotated[Session, Depends(get_db)]
Limit = Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)]
Cursor = Annotated[str | None, Query(max_length=200)]


@router.get("/posts/{post_id}", response_model=PostRead)
def get_post(post_id: UUID, user_id: CurrentUserId, db: DbSession):
    return posts.get_post(db, user_id, post_id)


@router.patch("/posts/{post_id}", response_model=PostRead)
def update_post(post_id: UUID, data: PostUpdate, user_id: CurrentUserId, db: DbSession):
    return posts.update_post(db, user_id, post_id, data)


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post(post_id: UUID, user_id: CurrentUserId, db: DbSession):
    posts.delete_post(db, user_id, post_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/posts/{post_id}/comments",
    response_model=CommentRead,
    status_code=status.HTTP_201_CREATED,
)
def create_comment(
    post_id: UUID, data: CommentCreate, user_id: CurrentUserId, db: DbSession
):
    return posts.create_comment(db, user_id, post_id, data)


@router.get("/posts/{post_id}/comments", response_model=Page[CommentRead])
def list_comments(
    post_id: UUID,
    user_id: CurrentUserId,
    db: DbSession,
    limit: Limit = DEFAULT_PAGE_SIZE,
    cursor: Cursor = None,
):
    """The post's comments, oldest first."""
    items, next_cursor = posts.list_comments(db, user_id, post_id, limit, cursor)
    return Page(items=items, next_cursor=next_cursor)


@router.patch("/comments/{comment_id}", response_model=CommentRead)
def update_comment(
    comment_id: UUID, data: CommentUpdate, user_id: CurrentUserId, db: DbSession
):
    return posts.update_comment(db, user_id, comment_id, data)


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(comment_id: UUID, user_id: CurrentUserId, db: DbSession):
    posts.delete_comment(db, user_id, comment_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
