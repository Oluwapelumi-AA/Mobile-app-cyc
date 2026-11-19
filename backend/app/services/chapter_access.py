"""Who can do what inside a Chapter.

Chapters are the only grouping in the app. Everything scoped to a Chapter
(posts, comments, reactions, events, meetings, resources, bans, reports and
announcements) asks this module for permission.

People and what they can do in one Chapter, strongest first:

- Platform Admin (``users.account_role = admin``): everything, everywhere.
- Platform Moderator (``account_role = moderator``): sees every Chapter,
  moderates content, reports and bans, and manages events, meetings and
  resources in every Chapter. Can't change Chapter settings or staff.
- Coordinator (``chapter_staff.role = coordinator``, one per Chapter): runs
  the Chapter: members, events, meetings, resources, announcements, access
  requests and grants, and moderates it.
- Chapter Moderator (``chapter_staff.role = moderator``): moderates the
  Chapter's posts and comments, reviews its reports and bans people from it.
- Member: an official Member (``users.membership_status = member``) whose
  ``user_profiles.chapter_id`` is this Chapter. Reads everything in it and
  posts, comments, reacts and registers.
- Guest: anyone else. Reads only the individual items a Coordinator granted
  them (``chapter_access_grant_items``); never writes.

Someone banned from a Chapter keeps read access but can't post, comment,
react or register there. Staff and platform staff can't be banned.
Archived Chapters are hidden from everyone except platform staff.
"""

import uuid
from enum import Enum

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.core.identity import UserId
from app.models.chapter import Chapter
from app.models.chapter_access_grant import ChapterAccessGrant, ChapterAccessGrantItem
from app.models.chapter_management import ChapterStaff, ChapterStaffRole
from app.models.moderation import ChapterBan
from app.models.user import AccountRole, MembershipStatus, User
from app.models.user_profile import UserProfile
from app.services.errors import Forbidden, NotFound

CHAPTER_NOT_FOUND = NotFound("chapter_not_found", "Chapter not found.")


class ChapterRole(str, Enum):
    """Someone's effective role in one Chapter, as reported to clients."""

    PLATFORM_ADMIN = "platform_admin"
    PLATFORM_MODERATOR = "platform_moderator"
    COORDINATOR = "coordinator"
    MODERATOR = "moderator"
    MEMBER = "member"


_RANK = {
    None: 0,
    ChapterRole.MEMBER: 1,
    ChapterRole.MODERATOR: 2,
    ChapterRole.COORDINATOR: 3,
    ChapterRole.PLATFORM_MODERATOR: 4,
    ChapterRole.PLATFORM_ADMIN: 5,
}


# Platform roles


def account_role(db: Session, user_id: UserId) -> AccountRole | None:
    return db.scalar(select(User.account_role).where(User.id == user_id))


def is_platform_admin(db: Session, user_id: UserId) -> bool:
    return account_role(db, user_id) == AccountRole.ADMIN


def is_platform_moderator(db: Session, user_id: UserId) -> bool:
    """True for app-wide moderators and admins."""
    return account_role(db, user_id) in (AccountRole.MODERATOR, AccountRole.ADMIN)


# Chapters


def get_chapter(db: Session, chapter_id: uuid.UUID) -> Chapter:
    chapter = db.get(Chapter, chapter_id)
    if chapter is None:
        raise CHAPTER_NOT_FOUND
    return chapter


def get_active_chapter(db: Session, chapter_id: uuid.UUID | None) -> Chapter | None:
    """A Chapter someone can attach things to: it exists and isn't archived."""
    if chapter_id is None:
        return None
    chapter = db.get(Chapter, chapter_id)
    if chapter is None or not chapter.is_active:
        raise CHAPTER_NOT_FOUND
    return chapter


def member_chapter_id(db: Session, user_id: UserId) -> uuid.UUID | None:
    """The Chapter the user officially belongs to, if they are a Member."""
    return db.scalar(
        select(UserProfile.chapter_id)
        .join(User, User.id == UserProfile.user_id)
        .where(
            UserProfile.user_id == user_id,
            User.membership_status == MembershipStatus.MEMBER,
        )
    )


def staff_role(db: Session, user_id: UserId, chapter_id: uuid.UUID) -> ChapterStaffRole | None:
    role = db.scalar(
        select(ChapterStaff.role).where(
            ChapterStaff.chapter_id == chapter_id,
            ChapterStaff.user_id == user_id,
        )
    )
    return ChapterStaffRole(role) if role else None


def is_coordinator(db: Session, user_id: UserId, chapter_id: uuid.UUID) -> bool:
    return staff_role(db, user_id, chapter_id) == ChapterStaffRole.COORDINATOR


def chapter_role(db: Session, user_id: UserId, chapter_id: uuid.UUID) -> ChapterRole | None:
    """The strongest role the user holds in this Chapter, or None."""
    platform = account_role(db, user_id)
    if platform == AccountRole.ADMIN:
        return ChapterRole.PLATFORM_ADMIN
    if platform == AccountRole.MODERATOR:
        return ChapterRole.PLATFORM_MODERATOR
    staff = staff_role(db, user_id, chapter_id)
    if staff == ChapterStaffRole.COORDINATOR:
        return ChapterRole.COORDINATOR
    if staff == ChapterStaffRole.MODERATOR:
        return ChapterRole.MODERATOR
    if member_chapter_id(db, user_id) == chapter_id:
        return ChapterRole.MEMBER
    return None


def rank(role: ChapterRole | None) -> int:
    return _RANK[role]


def is_banned(db: Session, chapter_id: uuid.UUID, user_id: UserId) -> bool:
    return (
        db.scalar(
            select(ChapterBan.id).where(
                ChapterBan.chapter_id == chapter_id,
                ChapterBan.user_id == user_id,
            )
        )
        is not None
    )


# Guest grants


def has_grant(
    db: Session,
    user_id: UserId,
    chapter_id: uuid.UUID,
    *,
    post_id: uuid.UUID | None = None,
    event_id: uuid.UUID | None = None,
    meeting_id: uuid.UUID | None = None,
    resource_id: uuid.UUID | None = None,
) -> bool:
    """True if a Coordinator granted this Guest access to that one item."""
    user = db.get(User, user_id)
    if user is None or not user.is_active or user.membership_status != MembershipStatus.GUEST:
        return False
    statement = (
        select(ChapterAccessGrantItem.id)
        .join(ChapterAccessGrant, ChapterAccessGrant.id == ChapterAccessGrantItem.grant_id)
        .where(
            ChapterAccessGrant.chapter_id == chapter_id,
            ChapterAccessGrant.user_id == user_id,
        )
    )
    if post_id is not None:
        statement = statement.where(ChapterAccessGrantItem.post_id == post_id)
    elif event_id is not None:
        statement = statement.where(ChapterAccessGrantItem.event_id == event_id)
    elif meeting_id is not None:
        statement = statement.where(ChapterAccessGrantItem.meeting_id == meeting_id)
    elif resource_id is not None:
        statement = statement.where(ChapterAccessGrantItem.resource_id == resource_id)
    else:
        return False
    return db.scalar(statement) is not None


def granted_ids(db: Session, user_id: UserId, column) -> Select:
    """Subquery of item ids of one kind granted to this user.

    ``column`` is one of ``ChapterAccessGrantItem.post_id``, ``.event_id``,
    ``.meeting_id`` or ``.resource_id``.
    """
    return (
        select(column)
        .join(ChapterAccessGrant, ChapterAccessGrant.id == ChapterAccessGrantItem.grant_id)
        .join(User, User.id == ChapterAccessGrant.user_id)
        .where(
            ChapterAccessGrant.user_id == user_id,
            User.membership_status == MembershipStatus.GUEST,
            column.is_not(None),
        )
    )


# Checks for one Chapter


def _active_or_staff(db: Session, user_id: UserId, chapter: Chapter) -> None:
    if not chapter.is_active and not is_platform_moderator(db, user_id):
        raise CHAPTER_NOT_FOUND


def can_read(db: Session, user_id: UserId, chapter_id: uuid.UUID) -> bool:
    """Members, staff and platform staff read all of a Chapter's content."""
    chapter = db.get(Chapter, chapter_id)
    if chapter is None:
        return False
    if not chapter.is_active and not is_platform_moderator(db, user_id):
        return False
    return chapter_role(db, user_id, chapter_id) is not None


def require_read(db: Session, user_id: UserId, chapter_id: uuid.UUID) -> ChapterRole:
    chapter = get_chapter(db, chapter_id)
    _active_or_staff(db, user_id, chapter)
    role = chapter_role(db, user_id, chapter_id)
    if role is None:
        raise Forbidden(
            "chapter_access_denied",
            "Only this Chapter's Members and staff can see this.",
        )
    return role


def require_participate(db: Session, user_id: UserId, chapter_id: uuid.UUID) -> ChapterRole:
    """Post, comment, react and register: Members and staff who aren't banned."""
    role = require_read(db, user_id, chapter_id)
    if role == ChapterRole.MEMBER and is_banned(db, chapter_id, user_id):
        raise Forbidden("banned", "You've been banned from taking part in this Chapter.")
    return role


def can_moderate(db: Session, user_id: UserId, chapter_id: uuid.UUID) -> bool:
    """Remove content, review reports and ban people in this Chapter."""
    return rank(chapter_role(db, user_id, chapter_id)) >= rank(ChapterRole.MODERATOR)


def require_moderate(db: Session, user_id: UserId, chapter_id: uuid.UUID) -> ChapterRole:
    chapter = get_chapter(db, chapter_id)
    _active_or_staff(db, user_id, chapter)
    role = chapter_role(db, user_id, chapter_id)
    if rank(role) < rank(ChapterRole.MODERATOR):
        raise Forbidden(
            "insufficient_role",
            "Only this Chapter's Moderators, its Coordinator and platform "
            "moderators or admins can do this.",
        )
    return role


def can_organize(db: Session, user_id: UserId, chapter_id: uuid.UUID) -> bool:
    """Create and manage the Chapter's events, meetings and resources."""
    return rank(chapter_role(db, user_id, chapter_id)) >= rank(ChapterRole.COORDINATOR)


def require_organize(db: Session, user_id: UserId, chapter_id: uuid.UUID) -> ChapterRole:
    chapter = get_chapter(db, chapter_id)
    _active_or_staff(db, user_id, chapter)
    role = chapter_role(db, user_id, chapter_id)
    if rank(role) < rank(ChapterRole.COORDINATOR):
        raise Forbidden(
            "insufficient_role",
            "Only this Chapter's Coordinator and platform moderators or admins can do this.",
        )
    return role


def require_coordinate(db: Session, user_id: UserId, chapter_id: uuid.UUID) -> None:
    """Run the Chapter: its Coordinator or a platform Admin."""
    get_chapter(db, chapter_id)
    if is_platform_admin(db, user_id) or is_coordinator(db, user_id, chapter_id):
        return
    raise Forbidden(
        "chapter_access_denied",
        "You can only manage your assigned Chapter.",
    )


# Subqueries for lists


def readable_chapter_ids(db: Session, user_id: UserId) -> Select | None:
    """Ids of Chapters whose content the user can read.

    None means every active Chapter (platform staff).
    """
    if is_platform_moderator(db, user_id):
        return None
    staff = select(ChapterStaff.chapter_id).where(ChapterStaff.user_id == user_id)
    member = (
        select(UserProfile.chapter_id)
        .join(User, User.id == UserProfile.user_id)
        .where(
            UserProfile.user_id == user_id,
            User.membership_status == MembershipStatus.MEMBER,
            UserProfile.chapter_id.is_not(None),
        )
    )
    return staff.union(member)


def organized_chapter_ids(db: Session, user_id: UserId) -> Select | None:
    """Chapters whose events, meetings and resources the user manages.

    None means every Chapter (platform staff).
    """
    if is_platform_moderator(db, user_id):
        return None
    return select(ChapterStaff.chapter_id).where(
        ChapterStaff.user_id == user_id,
        ChapterStaff.role == ChapterStaffRole.COORDINATOR.value,
    )


def moderated_chapter_ids(db: Session, user_id: UserId) -> Select | None:
    """Chapters the user moderates. None means every Chapter (platform staff)."""
    if is_platform_moderator(db, user_id):
        return None
    return select(ChapterStaff.chapter_id).where(ChapterStaff.user_id == user_id)


def active_chapter_ids() -> Select:
    return select(Chapter.id).where(Chapter.is_active.is_(True))


def member_ids(db: Session, chapter_id: uuid.UUID, *, active_only: bool = True) -> list[UserId]:
    """Official Members of the Chapter, for notifications."""
    statement = (
        select(UserProfile.user_id)
        .join(User, User.id == UserProfile.user_id)
        .where(
            UserProfile.chapter_id == chapter_id,
            User.membership_status == MembershipStatus.MEMBER,
        )
        .order_by(UserProfile.created_at, UserProfile.user_id)
    )
    if active_only:
        statement = statement.where(User.is_active.is_(True))
    return list(db.scalars(statement))
