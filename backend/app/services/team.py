"""The team: platform Admins, app Moderators and Chapter Coordinators.

Only platform Admins use these. Adding a Coordinator always names the
Chapter in the same step, so a Coordinator is never left without one:

- the person is an existing user, or a new account created here with a
  temporary password that is returned once;
- they become an official Member of that Chapter (moving them from any
  other Chapter: only an Admin can move a Member);
- a Chapter has one Coordinator. Taking over an occupied Chapter needs
  ``replace_current``; the previous Coordinator stays a Member.
"""

import secrets
import string
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.identity import UserId
from app.core.security import hash_password
from app.models.chapter import Chapter
from app.models.chapter_access_request import (
    ChapterAccessRequest,
    ChapterAccessRequestStatus,
)
from app.models.chapter_management import ChapterStaff, ChapterStaffRole
from app.models.refresh_session import RefreshSession
from app.models.user import AccountRole, MembershipStatus, User
from app.models.user_profile import UserProfile
from app.schemas.team import (
    AdminCreate,
    ChapterStaffEntry,
    CoordinatorCreate,
    NewAccount,
    PersonChoice,
    PlatformStaffRead,
    TeamChangeResult,
    TeamRead,
)
from app.services import audit, notifications
from app.services.chapter_access import is_platform_admin
from app.services.errors import Conflict, Forbidden, InvalidInput, NotFound

USER_NOT_FOUND = NotFound("user_not_found", "User not found.")
CHAPTER_NOT_FOUND = NotFound("chapter_not_found", "Active Chapter not found.")
EMAIL_TAKEN = Conflict("email_taken", "An account with this email already exists. Pick the existing user instead.")

# Unambiguous characters: no 0/O, 1/l/I.
_ALPHABET = "".join(c for c in string.ascii_letters + string.digits if c not in "0O1lI")


def _now() -> datetime:
    return datetime.now(UTC)


def _require_admin(db: Session, actor_id: UserId) -> None:
    if not is_platform_admin(db, actor_id):
        raise Forbidden("admin_only", "Only platform admins manage the team.")


def temporary_password(length: int = 16) -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(length))


def revoke_sessions(db: Session, user_id: uuid.UUID) -> None:
    """Sign the user out everywhere. Does not commit."""
    now = _now()
    for session in db.scalars(
        select(RefreshSession).where(
            RefreshSession.user_id == user_id, RefreshSession.revoked_at.is_(None)
        )
    ):
        session.revoked_at = now


# Reading


def team(db: Session, actor_id: UserId) -> TeamRead:
    _require_admin(db, actor_id)
    platform = db.execute(
        select(User, UserProfile)
        .outerjoin(UserProfile, UserProfile.user_id == User.id)
        .where(User.account_role.in_([AccountRole.ADMIN, AccountRole.MODERATOR]))
        .order_by(User.account_role, User.created_at)
    ).all()
    staff = db.execute(
        select(ChapterStaff, User, UserProfile, Chapter)
        .join(User, User.id == ChapterStaff.user_id)
        .outerjoin(UserProfile, UserProfile.user_id == User.id)
        .join(Chapter, Chapter.id == ChapterStaff.chapter_id)
        .order_by(Chapter.name, ChapterStaff.role, ChapterStaff.created_at)
    ).all()

    def person(user: User, profile: UserProfile | None) -> dict:
        return {
            "user_id": user.id,
            "email": user.email,
            "display_name": profile.display_name if profile else None,
            "avatar_url": profile.avatar_url if profile else None,
            "is_active": user.is_active,
            "last_login_at": user.last_login_at,
        }

    return TeamRead(
        platform=[
            PlatformStaffRead(
                **person(user, profile), account_role=user.account_role, created_at=user.created_at
            )
            for user, profile in platform
        ],
        chapter_staff=[
            ChapterStaffEntry(
                **person(user, profile),
                id=row.id,
                chapter_id=chapter.id,
                chapter_name=chapter.name,
                chapter_active=chapter.is_active,
                role=row.role,
                assigned_at=row.created_at,
            )
            for row, user, profile, chapter in staff
        ],
    )


# People


def _create_account(
    db: Session, actor_id: UserId, data: NewAccount, chapter_id: uuid.UUID | None
) -> tuple[User, UserProfile, str]:
    """Create a verified account with a temporary password. Does not commit."""
    email = str(data.email).strip().lower()
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise EMAIL_TAKEN
    password = temporary_password()
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=hash_password(password),
        is_verified=True,
    )
    db.add(user)
    db.flush()
    profile = UserProfile(
        user_id=user.id,
        display_name=data.display_name,
        language_code="en",
        onboarding_steps={},
        preferred_chapter_id=chapter_id,
    )
    db.add(profile)
    audit.record(db, actor_id, "user.created", "user", user.id, data={"by_admin": True})
    return user, profile, password


def _person(
    db: Session, actor_id: UserId, choice: PersonChoice, chapter_id: uuid.UUID | None = None
) -> tuple[User, UserProfile, str | None]:
    if choice.new_account is not None:
        return _create_account(db, actor_id, choice.new_account, chapter_id)
    user = db.get(User, choice.user_id)
    if user is None:
        raise USER_NOT_FOUND
    if not user.is_active:
        raise Conflict("user_suspended", "This account is suspended. Reinstate it first.")
    profile = db.get(UserProfile, user.id)
    if profile is None:
        # Existing users without a profile get a minimal one.
        profile = UserProfile(
            user_id=user.id,
            display_name=user.email.split("@")[0][:50],
            onboarding_steps={},
        )
        db.add(profile)
    return user, profile, None


def _commit(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise Conflict(
            "team_conflict", "Someone else changed this at the same time. Refresh and try again."
        ) from None


def _result(user: User, profile: UserProfile, password: str | None, replaced: uuid.UUID | None = None):
    return TeamChangeResult(
        user_id=user.id,
        email=user.email,
        display_name=profile.display_name,
        temporary_password=password,
        replaced_user_id=replaced,
    )


# Coordinators


def add_coordinator(db: Session, actor_id: UserId, data: CoordinatorCreate) -> TeamChangeResult:
    _require_admin(db, actor_id)
    chapter = db.get(Chapter, data.chapter_id)
    if chapter is None or not chapter.is_active:
        raise CHAPTER_NOT_FOUND

    current = db.scalar(
        select(ChapterStaff).where(
            ChapterStaff.chapter_id == chapter.id,
            ChapterStaff.role == ChapterStaffRole.COORDINATOR.value,
        )
    )
    if current is not None and data.user_id is not None and current.user_id == data.user_id:
        raise Conflict("already_coordinator", "They're already this Chapter's Coordinator.")
    if current is not None and not data.replace_current:
        raise Conflict(
            "coordinator_assignment_conflict",
            "This Chapter already has a Coordinator. Choose to replace them, or pick another Chapter.",
        )

    user, profile, password = _person(db, actor_id, data, chapter.id)

    replaced = None
    if current is not None:
        replaced = current.user_id
        db.delete(current)
        audit.record(
            db, actor_id, "chapter_staff.removed", "user", replaced,
            chapter_id=chapter.id, data={"role": "coordinator", "replaced_by": user.id},
        )
        notifications.staff_role_changed(db, chapter.id, replaced, None, actor_id)
        db.flush()

    # Official Member of this Chapter; an Admin may move them from another.
    previous_chapter = profile.chapter_id if user.membership_status == MembershipStatus.MEMBER else None
    if previous_chapter != chapter.id:
        user.membership_status = MembershipStatus.MEMBER
        profile.chapter_id = chapter.id
        profile.preferred_chapter_id = chapter.id
        now = _now()
        for request in db.scalars(
            select(ChapterAccessRequest).where(
                ChapterAccessRequest.user_id == user.id,
                ChapterAccessRequest.status == ChapterAccessRequestStatus.PENDING,
            )
        ):
            request.status = ChapterAccessRequestStatus.CANCELLED
            request.reviewed_at = now
            request.updated_at = now
        audit.record(
            db, actor_id, "member.assigned", "user", user.id,
            chapter_id=chapter.id, data={"from_chapter_id": previous_chapter, "as": "coordinator"},
        )

    # Their staff row for this Chapter becomes Coordinator (a Moderator is promoted).
    row = db.scalar(
        select(ChapterStaff).where(
            ChapterStaff.chapter_id == chapter.id, ChapterStaff.user_id == user.id
        )
    )
    previous_role = row.role if row is not None else None
    if row is None:
        db.add(
            ChapterStaff(
                id=uuid.uuid4(),
                chapter_id=chapter.id,
                user_id=user.id,
                role=ChapterStaffRole.COORDINATOR.value,
                assigned_by=actor_id,
            )
        )
    else:
        row.role = ChapterStaffRole.COORDINATOR.value
        row.assigned_by = actor_id
    audit.record(
        db, actor_id, "chapter_staff.assigned", "user", user.id,
        chapter_id=chapter.id, data={"from": previous_role, "to": "coordinator"},
    )
    notifications.staff_role_changed(db, chapter.id, user.id, "coordinator", actor_id)
    _commit(db)
    return _result(user, profile, password, replaced)


def remove_coordinator(db: Session, actor_id: UserId, chapter_id: uuid.UUID) -> None:
    """Remove the Chapter's Coordinator. They stay a Member."""
    _require_admin(db, actor_id)
    row = db.scalar(
        select(ChapterStaff).where(
            ChapterStaff.chapter_id == chapter_id,
            ChapterStaff.role == ChapterStaffRole.COORDINATOR.value,
        )
    )
    if row is None:
        raise NotFound("no_coordinator", "This Chapter has no Coordinator.")
    user_id = row.user_id
    db.delete(row)
    audit.record(
        db, actor_id, "chapter_staff.removed", "user", user_id,
        chapter_id=chapter_id, data={"role": "coordinator"},
    )
    notifications.staff_role_changed(db, chapter_id, user_id, None, actor_id)
    _commit(db)


# Platform admins and moderators


def add_platform_staff(db: Session, actor_id: UserId, data: AdminCreate) -> TeamChangeResult:
    _require_admin(db, actor_id)
    user, profile, password = _person(db, actor_id, data)
    if user.id == actor_id:
        raise InvalidInput("cannot_change_own_role", "Ask another admin to change your role.")
    old_role = AccountRole(user.account_role)
    if old_role == data.account_role and password is None:
        raise Conflict("already_has_role", f"They're already an {data.account_role.value}.")
    user.account_role = data.account_role
    audit.record(
        db, actor_id, "user.role_changed", "user", user.id,
        data={"from": old_role, "to": data.account_role},
    )
    _commit(db)
    return _result(user, profile, password)


def remove_platform_staff(db: Session, actor_id: UserId, target_id: uuid.UUID) -> None:
    """Take away someone's Admin or app Moderator role."""
    _require_admin(db, actor_id)
    if target_id == actor_id:
        raise InvalidInput("cannot_change_own_role", "Ask another admin to change your role.")
    user = db.get(User, target_id)
    if user is None:
        raise USER_NOT_FOUND
    old_role = AccountRole(user.account_role)
    if old_role == AccountRole.USER:
        raise NotFound("not_staff", "They don't have an app-wide role.")
    if old_role == AccountRole.ADMIN:
        admins = db.scalar(
            select(User.id).where(
                User.account_role == AccountRole.ADMIN, User.is_active.is_(True), User.id != target_id
            ).limit(1)
        )
        if admins is None:
            raise Conflict("last_admin", "You can't remove the last admin.")
    user.account_role = AccountRole.USER
    audit.record(
        db, actor_id, "user.role_changed", "user", user.id,
        data={"from": old_role, "to": AccountRole.USER},
    )
    _commit(db)


def reset_password(db: Session, actor_id: UserId, target_id: uuid.UUID) -> TeamChangeResult:
    """Give a team member a new temporary password, returned once."""
    _require_admin(db, actor_id)
    if target_id == actor_id:
        raise InvalidInput("use_change_password", "Change your own password from your account.")
    user = db.get(User, target_id)
    if user is None:
        raise USER_NOT_FOUND
    password = temporary_password()
    user.password_hash = hash_password(password)
    revoke_sessions(db, user.id)
    audit.record(db, actor_id, "user.password_reset", "user", user.id)
    _commit(db)
    profile = db.get(UserProfile, user.id)
    return TeamChangeResult(
        user_id=user.id,
        email=user.email,
        display_name=profile.display_name if profile else None,
        temporary_password=password,
    )
