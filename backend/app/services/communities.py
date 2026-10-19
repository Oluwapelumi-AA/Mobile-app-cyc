"""Communities, memberships and community role checks.

Role ranks, highest first: owner, admin, moderator, member.

- Any signed-in user can create a community and becomes its owner.
- Public communities are visible to everyone and anyone can join.
- Private communities are hidden from non-members (404) and cannot be joined
  until invitations exist.
- Admins and owners edit community details; only owners delete a community.
- Admins and owners change roles; moderators and above remove members. An
  actor can only act on members ranked below them and can only grant roles
  below their own. Owners can do anything, except that every community keeps
  at least one owner.
"""

import uuid
from collections.abc import Iterable

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.identity import UserId
from app.models.community import (
    Community,
    CommunityMembership,
    CommunityRole,
    CommunityVisibility,
)
from app.models.user import AccountRole, User
from app.schemas.community import (
    CommunityCreate,
    CommunityRead,
    CommunityUpdate,
)
from app.services import notifications, pagination
from app.services.errors import Conflict, Forbidden, NotFound

ROLE_RANK = {
    CommunityRole.MEMBER: 1,
    CommunityRole.MODERATOR: 2,
    CommunityRole.ADMIN: 3,
    CommunityRole.OWNER: 4,
}

COMMUNITY_NOT_FOUND = NotFound("community_not_found", "Community not found.")


def rank(role: str | CommunityRole | None) -> int:
    return 0 if role is None else ROLE_RANK[CommunityRole(role)]


def is_platform_moderator(db: Session, user_id: UserId) -> bool:
    """True for app-wide moderators and admins (users.account_role)."""
    role = db.scalar(select(User.account_role).where(User.id == user_id))
    return role in (AccountRole.MODERATOR, AccountRole.ADMIN)


def get_membership(
    db: Session, community_id: uuid.UUID, user_id: UserId
) -> CommunityMembership | None:
    return db.scalar(
        select(CommunityMembership).where(
            CommunityMembership.community_id == community_id,
            CommunityMembership.user_id == user_id,
        )
    )


def get_visible_community(
    db: Session, community_id: uuid.UUID, user_id: UserId
) -> tuple[Community, CommunityMembership | None]:
    """Load a community the user may see, with their membership if any."""
    community = db.get(Community, community_id)
    if community is None:
        raise COMMUNITY_NOT_FOUND
    membership = get_membership(db, community_id, user_id)
    if community.visibility == CommunityVisibility.PRIVATE.value and membership is None:
        raise COMMUNITY_NOT_FOUND
    return community, membership


def require_role(
    membership: CommunityMembership | None, minimum: CommunityRole
) -> CommunityMembership:
    if rank(membership.role if membership else None) < rank(minimum):
        if membership is None:
            raise Forbidden(
                "membership_required", "Join this community first."
            )
        raise Forbidden(
            "insufficient_role",
            f"This needs the {minimum.value} role or higher in this community.",
        )
    return membership


def _member_counts(db: Session, community_ids: Iterable[uuid.UUID]) -> dict[uuid.UUID, int]:
    ids = list(community_ids)
    if not ids:
        return {}
    rows = db.execute(
        select(CommunityMembership.community_id, func.count())
        .where(CommunityMembership.community_id.in_(ids))
        .group_by(CommunityMembership.community_id)
    )
    return dict(rows.all())


def _to_read(
    community: Community, member_count: int, my_role: str | None
) -> CommunityRead:
    return CommunityRead.model_validate(
        {
            "id": community.id,
            "name": community.name,
            "description": community.description,
            "visibility": community.visibility,
            "created_by": community.created_by,
            "member_count": member_count,
            "my_role": my_role,
            "created_at": community.created_at,
            "updated_at": community.updated_at,
        }
    )


def to_read(
    db: Session, community: Community, membership: CommunityMembership | None
) -> CommunityRead:
    count = _member_counts(db, [community.id]).get(community.id, 0)
    return _to_read(community, count, membership.role if membership else None)


def create_community(db: Session, user_id: UserId, data: CommunityCreate) -> CommunityRead:
    community = Community(
        name=data.name,
        description=data.description or None,
        visibility=data.visibility.value,
        created_by=user_id,
    )
    db.add(community)
    db.flush()
    membership = CommunityMembership(
        community_id=community.id,
        user_id=user_id,
        role=CommunityRole.OWNER.value,
    )
    db.add(membership)
    db.commit()
    db.refresh(community)
    return _to_read(community, 1, membership.role)


def list_communities(
    db: Session,
    user_id: UserId,
    limit: int,
    cursor: str | None,
    mine: bool,
) -> tuple[list[CommunityRead], str | None]:
    """Newest first: public communities plus private ones the user is in.

    With ``mine``, only communities the user belongs to.
    """
    my_ids = select(CommunityMembership.community_id).where(
        CommunityMembership.user_id == user_id
    )
    statement = select(Community)
    if mine:
        statement = statement.where(Community.id.in_(my_ids))
    else:
        statement = statement.where(
            or_(
                Community.visibility == CommunityVisibility.PUBLIC.value,
                Community.id.in_(my_ids),
            )
        )
    if cursor:
        statement = statement.where(
            pagination.after_cursor(Community.created_at, Community.id, cursor, newest_first=True)
        )
    statement = statement.order_by(
        *pagination.order_by(Community.created_at, Community.id, newest_first=True)
    ).limit(limit + 1)

    rows, next_cursor = pagination.split_page(list(db.scalars(statement)), limit)
    ids = [row.id for row in rows]
    counts = _member_counts(db, ids)
    my_roles = dict(
        db.execute(
            select(CommunityMembership.community_id, CommunityMembership.role).where(
                CommunityMembership.user_id == user_id,
                CommunityMembership.community_id.in_(ids),
            )
        ).all()
    ) if ids else {}
    items = [_to_read(row, counts.get(row.id, 0), my_roles.get(row.id)) for row in rows]
    return items, next_cursor


def update_community(
    db: Session, user_id: UserId, community_id: uuid.UUID, data: CommunityUpdate
) -> CommunityRead:
    community, membership = get_visible_community(db, community_id, user_id)
    require_role(membership, CommunityRole.ADMIN)
    changes = data.model_dump(exclude_unset=True)
    if changes.get("name") is None:
        changes.pop("name", None)
    if changes.get("visibility") is None:
        changes.pop("visibility", None)
    else:
        changes["visibility"] = changes["visibility"].value
    if "description" in changes:
        changes["description"] = changes["description"] or None
    for name, value in changes.items():
        setattr(community, name, value)
    db.commit()
    db.refresh(community)
    return to_read(db, community, membership)


def delete_community(db: Session, user_id: UserId, community_id: uuid.UUID) -> None:
    # Imported here to avoid a cycle: posts imports this module.
    from app.services.posts import delete_posts

    community, membership = get_visible_community(db, community_id, user_id)
    require_role(membership, CommunityRole.OWNER)
    delete_posts(db, community_id=community.id)
    db.execute(
        CommunityMembership.__table__.delete().where(
            CommunityMembership.community_id == community.id
        )
    )
    db.delete(community)
    db.commit()


def join_community(db: Session, user_id: UserId, community_id: uuid.UUID) -> CommunityMembership:
    community, membership = get_visible_community(db, community_id, user_id)
    if membership is not None:
        raise Conflict("already_member", "You are already a member of this community.")
    if community.visibility != CommunityVisibility.PUBLIC.value:
        raise Forbidden("invite_required", "This community is invite only.")
    membership = CommunityMembership(
        community_id=community.id,
        user_id=user_id,
        role=CommunityRole.MEMBER.value,
    )
    db.add(membership)
    try:
        db.commit()
    except IntegrityError:
        # Two join requests raced; the other one won.
        db.rollback()
        raise Conflict("already_member", "You are already a member of this community.") from None
    db.refresh(membership)
    return membership


def _owner_count(db: Session, community_id: uuid.UUID) -> int:
    return db.scalar(
        select(func.count()).where(
            CommunityMembership.community_id == community_id,
            CommunityMembership.role == CommunityRole.OWNER.value,
        )
    )


def _ensure_not_last_owner(db: Session, target: CommunityMembership) -> None:
    if target.role == CommunityRole.OWNER.value and _owner_count(db, target.community_id) <= 1:
        raise Conflict(
            "last_owner",
            "A community needs at least one owner. Make someone else an owner first.",
        )


def leave_community(db: Session, user_id: UserId, community_id: uuid.UUID) -> None:
    _, membership = get_visible_community(db, community_id, user_id)
    if membership is None:
        raise NotFound("not_member", "You are not a member of this community.")
    _ensure_not_last_owner(db, membership)
    db.delete(membership)
    db.commit()


def list_members(
    db: Session,
    user_id: UserId,
    community_id: uuid.UUID,
    limit: int,
    cursor: str | None,
) -> tuple[list[CommunityMembership], str | None]:
    """Members in the order they joined."""
    get_visible_community(db, community_id, user_id)
    statement = select(CommunityMembership).where(
        CommunityMembership.community_id == community_id
    )
    if cursor:
        statement = statement.where(
            pagination.after_cursor(
                CommunityMembership.joined_at, CommunityMembership.id, cursor, newest_first=False
            )
        )
    statement = statement.order_by(
        *pagination.order_by(CommunityMembership.joined_at, CommunityMembership.id, newest_first=False)
    ).limit(limit + 1)
    return pagination.split_page(list(db.scalars(statement)), limit, created_attr="joined_at")


def _get_target(db: Session, community_id: uuid.UUID, target_user_id: UserId) -> CommunityMembership:
    target = get_membership(db, community_id, target_user_id)
    if target is None:
        raise NotFound("member_not_found", "That user is not a member of this community.")
    return target


def _ensure_outranks(actor: CommunityMembership, target: CommunityMembership) -> None:
    if actor.role != CommunityRole.OWNER.value and rank(actor.role) <= rank(target.role):
        raise Forbidden(
            "insufficient_role", "You can only manage members ranked below you."
        )


def change_member_role(
    db: Session,
    user_id: UserId,
    community_id: uuid.UUID,
    target_user_id: UserId,
    new_role: CommunityRole,
) -> CommunityMembership:
    _, membership = get_visible_community(db, community_id, user_id)
    actor = require_role(membership, CommunityRole.ADMIN)
    target = _get_target(db, community_id, target_user_id)
    _ensure_outranks(actor, target)
    if actor.role != CommunityRole.OWNER.value and rank(new_role) >= rank(actor.role):
        raise Forbidden(
            "insufficient_role", "You can only give roles below your own."
        )
    if new_role != CommunityRole.OWNER:
        _ensure_not_last_owner(db, target)
    if target.role != new_role.value:
        target.role = new_role.value
        notifications.member_role_changed(db, target, user_id)
    db.commit()
    db.refresh(target)
    return target


def remove_member(
    db: Session,
    user_id: UserId,
    community_id: uuid.UUID,
    target_user_id: UserId,
) -> None:
    if target_user_id == user_id:
        leave_community(db, user_id, community_id)
        return
    _, membership = get_visible_community(db, community_id, user_id)
    actor = require_role(membership, CommunityRole.MODERATOR)
    target = _get_target(db, community_id, target_user_id)
    _ensure_outranks(actor, target)
    _ensure_not_last_owner(db, target)
    db.delete(target)
    notifications.member_removed(db, community_id, target_user_id, user_id)
    db.commit()
