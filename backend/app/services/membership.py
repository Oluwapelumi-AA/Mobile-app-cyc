"""Open Chapter membership and self-service departments.

- Chapters are open: anyone who finishes onboarding with a Chapter chosen
  becomes an official Member of it straight away. No Coordinator approval.
- Before onboarding is complete, choosing a Chapter only records the choice
  (``preferred_chapter_id``); membership starts when onboarding completes.
- A user who finished onboarding without choosing can join a Chapter later.
- A Member belongs to one Chapter and cannot leave it or move to another.
  Only a platform Admin can move a Member (Users → Membership).
- Members pick their own department, and can leave it or move to another.
  Departments are app-wide; a Member is in at most one.
- Platform Admins can add Members to, or remove them from, any department.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.identity import UserId
from app.models.chapter import Chapter
from app.models.chapter_access_request import (
    ChapterAccessRequest,
    ChapterAccessRequestStatus,
)
from app.models.chapter_management import ChapterStaff, Department
from app.models.user import MembershipStatus, User
from app.models.user_profile import UserProfile
from app.schemas.membership import (
    DepartmentMemberRead,
    MyMembershipRead,
    PublicProfileRead,
    StaffRole,
)
from app.services import audit
from app.services.chapter_access import is_platform_admin
from app.services.errors import Conflict, Forbidden, NotFound

USER_NOT_FOUND = NotFound("user_not_found", "User not found.")
PROFILE_NOT_FOUND = NotFound("profile_not_found", "Create your profile first.")
CHAPTER_NOT_FOUND = NotFound("chapter_not_found", "Active Chapter not found.")
DEPARTMENT_NOT_FOUND = NotFound("department_not_found", "Department not found.")
ALREADY_IN_A_CHAPTER = Conflict(
    "already_in_a_chapter",
    "You're already a Member of a Chapter. Members can't leave or switch Chapters.",
)
NOT_A_MEMBER = Conflict(
    "membership_required",
    "Join a Chapter before choosing a department.",
)


def _now() -> datetime:
    return datetime.now(UTC)


def _user_and_profile(db: Session, user_id: UserId) -> tuple[User, UserProfile]:
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise USER_NOT_FOUND
    profile = db.get(UserProfile, user_id)
    if profile is None:
        raise PROFILE_NOT_FOUND
    return user, profile


def _active_chapter(db: Session, chapter_id: uuid.UUID) -> Chapter:
    chapter = db.get(Chapter, chapter_id)
    if chapter is None or not chapter.is_active:
        raise CHAPTER_NOT_FOUND
    return chapter


def _settle_requests(db: Session, user_id: UserId, chapter_id: uuid.UUID) -> None:
    """Close the user's pending Guest requests: the joined Chapter's as
    approved, any others as cancelled. Does not commit."""
    now = _now()
    for request in db.scalars(
        select(ChapterAccessRequest).where(
            ChapterAccessRequest.user_id == user_id,
            ChapterAccessRequest.status == ChapterAccessRequestStatus.PENDING,
        )
    ):
        request.status = (
            ChapterAccessRequestStatus.APPROVED
            if request.chapter_id == chapter_id
            else ChapterAccessRequestStatus.CANCELLED
        )
        request.reviewed_at = now
        request.updated_at = now


def _make_member(
    db: Session, user: User, profile: UserProfile, chapter_id: uuid.UUID, how: str
) -> None:
    """Make a Guest an official Member of the Chapter. Does not commit.
    Existing Members are left where they are."""
    if user.membership_status == MembershipStatus.MEMBER and profile.chapter_id is not None:
        return
    user.membership_status = MembershipStatus.MEMBER
    profile.chapter_id = chapter_id
    profile.preferred_chapter_id = chapter_id
    _settle_requests(db, user.id, chapter_id)
    audit.record(
        db,
        user.id,
        "member.joined",
        "user",
        user.id,
        chapter_id=chapter_id,
        data={"how": how},
    )
    chapter = db.get(Chapter, chapter_id)
    if chapter is not None:
        from app.emails import templates
        from app.services import mailer

        first = profile.display_name.split(" ")[0] if profile.display_name else None
        mailer.send(db, user.email, templates.chapter_joined(first, chapter.name), "chapter_joined")


# Chapters


def my_membership(db: Session, user_id: UserId) -> MyMembershipRead:
    user, profile = _user_and_profile(db, user_id)
    member = user.membership_status == MembershipStatus.MEMBER
    chapter = db.get(Chapter, profile.chapter_id) if member and profile.chapter_id else None
    department = db.get(Department, profile.department_id) if profile.department_id else None
    return MyMembershipRead(
        membership_status=user.membership_status,
        chapter_id=chapter.id if chapter else None,
        chapter_name=chapter.name if chapter else None,
        preferred_chapter_id=profile.preferred_chapter_id,
        department_id=department.id if department and member else None,
        department_name=department.name if department and member else None,
        onboarding_complete=profile.onboarding_completed_at is not None,
    )


def choose_chapter(db: Session, user_id: UserId, chapter_id: uuid.UUID) -> MyMembershipRead:
    """Pick a Chapter. During onboarding this records the choice; afterwards
    it joins the Chapter at once. Members cannot change Chapter."""
    user, profile = _user_and_profile(db, user_id)
    if user.membership_status == MembershipStatus.MEMBER and profile.chapter_id is not None:
        if profile.chapter_id == chapter_id:
            return my_membership(db, user_id)
        raise ALREADY_IN_A_CHAPTER
    _active_chapter(db, chapter_id)
    if profile.onboarding_completed_at is None:
        profile.preferred_chapter_id = chapter_id
    else:
        _make_member(db, user, profile, chapter_id, "self")
    db.commit()
    return my_membership(db, user_id)


def join_after_onboarding(db: Session, user_id: UserId) -> None:
    """Called when onboarding completes: join the Chapter chosen during
    onboarding, if any and still active. Commits."""
    user = db.get(User, user_id)
    profile = db.get(UserProfile, user_id)
    if user is None or profile is None or profile.preferred_chapter_id is None:
        return
    chapter = db.get(Chapter, profile.preferred_chapter_id)
    if chapter is None or not chapter.is_active:
        return
    _make_member(db, user, profile, chapter.id, "onboarding")
    db.commit()


# Departments: self-service


def _require_member(user: User) -> None:
    if user.membership_status != MembershipStatus.MEMBER:
        raise NOT_A_MEMBER


def _department(db: Session, department_id: uuid.UUID) -> Department:
    department = db.get(Department, department_id)
    if department is None:
        raise DEPARTMENT_NOT_FOUND
    return department


def _set_department(
    db: Session,
    actor_id: UserId,
    user: User,
    profile: UserProfile,
    department_id: uuid.UUID | None,
) -> None:
    """Move the Member into a department, or out of theirs. Does not commit."""
    previous = profile.department_id
    if previous == department_id:
        return
    profile.department_id = department_id
    audit.record(
        db,
        actor_id,
        "department.joined" if department_id else "department.left",
        "user",
        user.id,
        chapter_id=profile.chapter_id,
        data={"department_id": department_id, "from_department_id": previous},
    )


def join_department(db: Session, user_id: UserId, department_id: uuid.UUID) -> MyMembershipRead:
    user, profile = _user_and_profile(db, user_id)
    _require_member(user)
    _department(db, department_id)
    _set_department(db, user_id, user, profile, department_id)
    db.commit()
    return my_membership(db, user_id)


def leave_department(db: Session, user_id: UserId) -> MyMembershipRead:
    user, profile = _user_and_profile(db, user_id)
    _set_department(db, user_id, user, profile, None)
    db.commit()
    return my_membership(db, user_id)


# Departments: admin


def _require_admin(db: Session, actor_id: UserId) -> None:
    if not is_platform_admin(db, actor_id):
        raise Forbidden("admin_only", "Only platform admins manage department members.")


def list_department_members(
    db: Session, actor_id: UserId, department_id: uuid.UUID
) -> list[DepartmentMemberRead]:
    _require_admin(db, actor_id)
    _department(db, department_id)
    rows = db.execute(
        select(User, UserProfile, Chapter)
        .join(UserProfile, UserProfile.user_id == User.id)
        .outerjoin(Chapter, Chapter.id == UserProfile.chapter_id)
        .where(
            UserProfile.department_id == department_id,
            User.membership_status == MembershipStatus.MEMBER,
        )
        .order_by(UserProfile.display_name, User.email)
    ).all()
    return [
        DepartmentMemberRead(
            user_id=user.id,
            email=user.email,
            display_name=profile.display_name,
            avatar_url=profile.avatar_url,
            chapter_id=chapter.id if chapter else None,
            chapter_name=chapter.name if chapter else None,
        )
        for user, profile, chapter in rows
    ]


def add_to_department(
    db: Session, actor_id: UserId, department_id: uuid.UUID, target_id: uuid.UUID
) -> None:
    """Put a Member in the department, moving them out of any other."""
    _require_admin(db, actor_id)
    _department(db, department_id)
    user = db.get(User, target_id)
    profile = db.get(UserProfile, target_id)
    if user is None or profile is None:
        raise USER_NOT_FOUND
    if user.membership_status != MembershipStatus.MEMBER:
        raise Conflict("membership_required", "Only Chapter Members can be in a department.")
    _set_department(db, actor_id, user, profile, department_id)
    db.commit()


def remove_from_department(
    db: Session, actor_id: UserId, department_id: uuid.UUID, target_id: uuid.UUID
) -> None:
    _require_admin(db, actor_id)
    _department(db, department_id)
    user = db.get(User, target_id)
    profile = db.get(UserProfile, target_id)
    if user is None or profile is None or profile.department_id != department_id:
        raise NotFound("not_in_department", "That member isn't in this department.")
    _set_department(db, actor_id, user, profile, None)
    db.commit()


# Public profiles


def public_profile(db: Session, viewer_id: UserId, user_id: uuid.UUID) -> PublicProfileRead:
    """Any signed-in user can view another person's public profile."""
    user = db.get(User, user_id)
    profile = db.get(UserProfile, user_id)
    if user is None or profile is None:
        raise NotFound("profile_not_found", "Profile not found.")
    deleted = not user.is_active and user.email.endswith("@deleted.invalid")
    member = user.membership_status == MembershipStatus.MEMBER
    chapter = db.get(Chapter, profile.chapter_id) if member and profile.chapter_id else None
    department = (
        db.get(Department, profile.department_id) if member and profile.department_id else None
    )
    roles = db.execute(
        select(ChapterStaff.chapter_id, Chapter.name, ChapterStaff.role)
        .join(Chapter, Chapter.id == ChapterStaff.chapter_id)
        .where(ChapterStaff.user_id == user.id, Chapter.is_active.is_(True))
        .order_by(Chapter.name)
    ).all()
    return PublicProfileRead(
        user_id=user.id,
        display_name=profile.display_name,
        avatar_url=None if deleted else profile.avatar_url,
        bio=None if deleted else profile.bio,
        membership_status=user.membership_status,
        chapter_id=chapter.id if chapter and chapter.is_active else None,
        chapter_name=chapter.name if chapter and chapter.is_active else None,
        department_name=department.name if department else None,
        account_role=user.account_role,
        staff_roles=[StaffRole(chapter_id=c, chapter_name=n, role=r) for c, n, r in roles],
        is_deleted=deleted,
        member_since=profile.created_at,
    )
