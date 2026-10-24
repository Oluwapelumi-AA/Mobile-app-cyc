
"""API endpoints for post and comment reactions."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_id
from app.core.identity import UserId
from app.db.session import get_db
from app.schemas.reaction import ReactionCreate, ReactionRead
from app.services.posts import ensure_can_react
from app.services.reactions import (
    ReactionNotFound,
    remove_reaction,
    set_reaction,
)

router = APIRouter(prefix="/reactions", tags=["Reactions"])

CurrentUserId = Annotated[UserId, Depends(get_current_user_id)]
DbSession = Annotated[Session, Depends(get_db)]


@router.put("/posts/{post_id}", response_model=ReactionRead)
def react_to_post(
    post_id: UUID,
    payload: ReactionCreate,
    user_id: CurrentUserId,
    db: DbSession,
) -> ReactionRead:
    """Add or change the current user's reaction to a post."""

    ensure_can_react(db, user_id, "post", post_id)

    return set_reaction(
        db=db,
        user_id=user_id,
        target_type="post",
        target_id=post_id,
        reaction_type=payload.reaction_type,
    )


@router.delete(
    "/posts/{post_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def unreact_to_post(
    post_id: UUID,
    user_id: CurrentUserId,
    db: DbSession,
) -> Response:
    """Remove the current user's reaction to a post."""

    ensure_can_react(db, user_id, "post", post_id)

    try:
        remove_reaction(db, user_id, "post", post_id)
    except ReactionNotFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="You have not reacted to this post.",
        ) from None

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/comments/{comment_id}", response_model=ReactionRead)
def react_to_comment(
    comment_id: UUID,
    payload: ReactionCreate,
    user_id: CurrentUserId,
    db: DbSession,
) -> ReactionRead:
    """Add or change the current user's reaction to a comment."""

    ensure_can_react(db, user_id, "comment", comment_id)

    return set_reaction(
        db=db,
        user_id=user_id,
        target_type="comment",
        target_id=comment_id,
        reaction_type=payload.reaction_type,
    )


@router.delete(
    "/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def unreact_to_comment(
    comment_id: UUID,
    user_id: CurrentUserId,
    db: DbSession,
) -> Response:
    """Remove the current user's reaction to a comment."""

    ensure_can_react(db, user_id, "comment", comment_id)

    try:
        remove_reaction(db, user_id, "comment", comment_id)
    except ReactionNotFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="You have not reacted to this comment.",
        ) from None

    return Response(status_code=status.HTTP_204_NO_CONTENT)
