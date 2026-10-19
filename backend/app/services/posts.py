"""Posts and comments inside communities.

- Reading needs the community to be visible to the user: public, or one they
  belong to. Hidden posts and comments answer 404, like hidden communities.
- Writing a post or comment needs membership of the community.
- Only the author edits. The author, community moderators and above, or
  app-wide moderators and admins can delete. When someone else deletes it,
  the author is told and it goes in the audit log with the removed text.

Reactions (owned by the auth/reactions workstream) point at posts and comments
by ``target_type`` + ``target_id`` without a foreign key, so deleting content
here also deletes its reactions.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.identity import UserId
from app.models.community import CommunityMembership, CommunityRole
from app.models.post import Comment, Post
from app.models.reaction import Reaction
from app.schemas.post import (
    CommentCreate,
    CommentUpdate,
    PostCreate,
    PostRead,
    PostUpdate,
)
from app.services import audit, notifications, pagination
from app.services.communities import (
    get_visible_community,
    is_platform_moderator,
    rank,
    require_role,
)
from app.services.errors import Forbidden, NotFound

POST_NOT_FOUND = NotFound("post_not_found", "Post not found.")
COMMENT_NOT_FOUND = NotFound("comment_not_found", "Comment not found.")


def _now() -> datetime:
    return datetime.now(UTC)


def _comment_counts(db: Session, post_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    if not post_ids:
        return {}
    rows = db.execute(
        select(Comment.post_id, func.count())
        .where(Comment.post_id.in_(post_ids))
        .group_by(Comment.post_id)
    )
    return dict(rows.all())


def _post_read(post: Post, comment_count: int) -> PostRead:
    return PostRead.model_validate(
        {
            "id": post.id,
            "community_id": post.community_id,
            "author_id": post.author_id,
            "body": post.body,
            "comment_count": comment_count,
            "created_at": post.created_at,
            "updated_at": post.updated_at,
            "edited_at": post.edited_at,
        }
    )


def post_read(db: Session, post: Post) -> PostRead:
    return _post_read(post, _comment_counts(db, [post.id]).get(post.id, 0))


def _can_moderate(
    db: Session, user_id: UserId, membership: CommunityMembership | None
) -> bool:
    if membership is not None and rank(membership.role) >= rank(CommunityRole.MODERATOR):
        return True
    return is_platform_moderator(db, user_id)


def _visible_post(
    db: Session, user_id: UserId, post_id: uuid.UUID
) -> tuple[Post, CommunityMembership | None]:
    post = db.get(Post, post_id)
    if post is None:
        raise POST_NOT_FOUND
    try:
        _, membership = get_visible_community(db, post.community_id, user_id)
    except NotFound:
        raise POST_NOT_FOUND from None
    return post, membership


def _delete_reactions(db: Session, target_type: str, target_ids) -> None:
    db.execute(
        delete(Reaction).where(
            Reaction.target_type == target_type,
            Reaction.target_id.in_(target_ids),
        )
    )


def delete_posts(
    db: Session,
    *,
    community_id: uuid.UUID | None = None,
    post_id: uuid.UUID | None = None,
) -> None:
    """Delete posts, their comments and the reactions on both. No commit."""
    post_ids = select(Post.id).where(
        Post.community_id == community_id if community_id else Post.id == post_id
    )
    comment_ids = select(Comment.id).where(Comment.post_id.in_(post_ids))
    _delete_reactions(db, "comment", comment_ids)
    _delete_reactions(db, "post", post_ids)
    db.execute(delete(Comment).where(Comment.post_id.in_(post_ids)))
    db.execute(delete(Post).where(Post.id.in_(post_ids)))


# Posts


def create_post(
    db: Session, user_id: UserId, community_id: uuid.UUID, data: PostCreate
) -> PostRead:
    _, membership = get_visible_community(db, community_id, user_id)
    require_role(membership, CommunityRole.MEMBER)
    post = Post(community_id=community_id, author_id=user_id, body=data.body)
    db.add(post)
    db.commit()
    db.refresh(post)
    return _post_read(post, 0)


def list_feed(
    db: Session,
    user_id: UserId,
    community_id: uuid.UUID,
    limit: int,
    cursor: str | None,
) -> tuple[list[PostRead], str | None]:
    """A community's posts, newest first."""
    get_visible_community(db, community_id, user_id)
    statement = select(Post).where(Post.community_id == community_id)
    if cursor:
        statement = statement.where(
            pagination.after_cursor(Post.created_at, Post.id, cursor, newest_first=True)
        )
    statement = statement.order_by(
        *pagination.order_by(Post.created_at, Post.id, newest_first=True)
    ).limit(limit + 1)
    rows, next_cursor = pagination.split_page(list(db.scalars(statement)), limit)
    counts = _comment_counts(db, [row.id for row in rows])
    return [_post_read(row, counts.get(row.id, 0)) for row in rows], next_cursor


def get_post(db: Session, user_id: UserId, post_id: uuid.UUID) -> PostRead:
    post, _ = _visible_post(db, user_id, post_id)
    return post_read(db, post)


def update_post(
    db: Session, user_id: UserId, post_id: uuid.UUID, data: PostUpdate
) -> PostRead:
    post, _ = _visible_post(db, user_id, post_id)
    if post.author_id != user_id:
        raise Forbidden("not_author", "Only the author can edit this post.")
    post.body = data.body
    post.edited_at = _now()
    db.commit()
    db.refresh(post)
    return post_read(db, post)


def remove_post(db: Session, actor_id: UserId, post: Post, **audit_data) -> None:
    """A moderator removes someone's post. No commit."""
    audit.record(
        db,
        actor_id,
        "post.removed",
        "post",
        post.id,
        community_id=post.community_id,
        data={"author_id": post.author_id, "body": post.body, **audit_data},
    )
    notifications.content_removed(
        db, "post", post.author_id, post.community_id, actor_id, {"post_id": post.id}
    )
    delete_posts(db, post_id=post.id)


def remove_comment(db: Session, actor_id: UserId, comment: Comment, **audit_data) -> None:
    """A moderator removes someone's comment. No commit."""
    community_id = db.scalar(select(Post.community_id).where(Post.id == comment.post_id))
    audit.record(
        db,
        actor_id,
        "comment.removed",
        "comment",
        comment.id,
        community_id=community_id,
        data={
            "author_id": comment.author_id,
            "post_id": comment.post_id,
            "body": comment.body,
            **audit_data,
        },
    )
    notifications.content_removed(
        db,
        "comment",
        comment.author_id,
        community_id,
        actor_id,
        {"post_id": comment.post_id, "comment_id": comment.id},
    )
    _delete_reactions(db, "comment", [comment.id])
    db.delete(comment)


def delete_post(db: Session, user_id: UserId, post_id: uuid.UUID) -> None:
    post, membership = _visible_post(db, user_id, post_id)
    if post.author_id == user_id:
        delete_posts(db, post_id=post.id)
    elif _can_moderate(db, user_id, membership):
        remove_post(db, user_id, post)
    else:
        raise Forbidden("not_allowed", "You can't delete this post.")
    db.commit()


# Comments


def create_comment(
    db: Session, user_id: UserId, post_id: uuid.UUID, data: CommentCreate
) -> Comment:
    post, membership = _visible_post(db, user_id, post_id)
    require_role(membership, CommunityRole.MEMBER)
    comment = Comment(post_id=post.id, author_id=user_id, body=data.body)
    db.add(comment)
    db.flush()
    notifications.comment_added(db, post, comment)
    db.commit()
    db.refresh(comment)
    return comment


def list_comments(
    db: Session,
    user_id: UserId,
    post_id: uuid.UUID,
    limit: int,
    cursor: str | None,
) -> tuple[list[Comment], str | None]:
    """A post's comments, oldest first."""
    _visible_post(db, user_id, post_id)
    statement = select(Comment).where(Comment.post_id == post_id)
    if cursor:
        statement = statement.where(
            pagination.after_cursor(Comment.created_at, Comment.id, cursor, newest_first=False)
        )
    statement = statement.order_by(
        *pagination.order_by(Comment.created_at, Comment.id, newest_first=False)
    ).limit(limit + 1)
    return pagination.split_page(list(db.scalars(statement)), limit)


def _visible_comment(
    db: Session, user_id: UserId, comment_id: uuid.UUID
) -> tuple[Comment, CommunityMembership | None]:
    comment = db.get(Comment, comment_id)
    if comment is None:
        raise COMMENT_NOT_FOUND
    try:
        _, membership = _visible_post(db, user_id, comment.post_id)
    except NotFound:
        raise COMMENT_NOT_FOUND from None
    return comment, membership


def update_comment(
    db: Session, user_id: UserId, comment_id: uuid.UUID, data: CommentUpdate
) -> Comment:
    comment, _ = _visible_comment(db, user_id, comment_id)
    if comment.author_id != user_id:
        raise Forbidden("not_author", "Only the author can edit this comment.")
    comment.body = data.body
    comment.edited_at = _now()
    db.commit()
    db.refresh(comment)
    return comment


def delete_comment(db: Session, user_id: UserId, comment_id: uuid.UUID) -> None:
    comment, membership = _visible_comment(db, user_id, comment_id)
    if comment.author_id == user_id:
        _delete_reactions(db, "comment", [comment.id])
        db.delete(comment)
    elif _can_moderate(db, user_id, membership):
        remove_comment(db, user_id, comment)
    else:
        raise Forbidden("not_allowed", "You can't delete this comment.")
    db.commit()


def visible_post(db: Session, user_id: UserId, post_id: uuid.UUID):
    """The post and the user's membership, or 404 if they can't see it."""
    return _visible_post(db, user_id, post_id)


def visible_comment(db: Session, user_id: UserId, comment_id: uuid.UUID):
    """The comment and the user's membership, or 404 if they can't see it."""
    return _visible_comment(db, user_id, comment_id)


# Reactions hook


def ensure_can_react(
    db: Session, user_id: UserId, target_type: str, target_id: uuid.UUID
) -> None:
    """Check a reaction target exists, is visible, and the user is a member.

    For the reactions endpoints to call before saving a reaction. Raises
    ``NotFound`` (404) or ``Forbidden`` (403) like the other endpoints here.
    """
    if target_type == "post":
        _, membership = _visible_post(db, user_id, target_id)
    elif target_type == "comment":
        _, membership = _visible_comment(db, user_id, target_id)
    else:
        raise ValueError(f"Unknown reaction target type: {target_type}")
    require_role(membership, CommunityRole.MEMBER)
