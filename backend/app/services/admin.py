"""Admin tools for app staff (users.account_role moderator or admin).

- Staff list and look up users, and suspend or reinstate them. A suspended
  user is an inactive user: they can't sign in or use their tokens, their
  sign-in sessions are revoked and their push devices forgotten.
- Staff only act on people ranked below them (user < moderator < admin), so
  moderators suspend users and admins suspend moderators and users.
- Only admins change account roles, and never their own.
- Everything here goes in the audit log.

Users and their account fields belong to the auth workstream; this module only
reads them and flips ``is_active`` and ``account_role``.
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.orm import Session

from app.core.identity import UserId
from app.models.branch import Branch
from app.models.community import Community
from app.models.event import Event, EventStatus
from app.models.moderation import ContentReport, ReportStatus
from app.models.notification import NotificationDevice
from app.models.post import Post
from app.models.refresh_session import RefreshSession
from app.models.user import AccountRole, User
from app.models.user_profile import UserProfile
from app.schemas.moderation import (
    AccountRoleUpdate,
    AdminOverview,
    AdminUserRead,
    ReinstateRequest,
    SuspendRequest,
)
from app.services import audit, pagination
from app.services.errors import Conflict, Forbidden, InvalidInput, NotFound

USER_NOT_FOUND = NotFound("user_not_found", "User not found.")

STAFF_RANK = {AccountRole.USER: 1, AccountRole.MODERATOR: 2, AccountRole.ADMIN: 3}


def _now() -> datetime:
    return datetime.now(UTC)


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _role(db: Session, user_id: UserId) -> AccountRole | None:
    return db.scalar(select(User.account_role).where(User.id == user_id))


def require_staff(db: Session, user_id: UserId) -> AccountRole:
    role = _role(db, user_id)
    if role not in (AccountRole.MODERATOR, AccountRole.ADMIN):
        raise Forbidden("staff_only", "Only app moderators and admins can do this.")
    return role


def _require_admin(db: Session, user_id: UserId) -> None:
    if _role(db, user_id) != AccountRole.ADMIN:
        raise Forbidden("admin_only", "Only app admins can do this.")


def _open_reports(db: Session, user_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    if not user_ids:
        return {}
    rows = db.execute(
        select(ContentReport.target_owner_id, func.count())
        .where(
            ContentReport.status == ReportStatus.OPEN.value,
            ContentReport.target_owner_id.in_(user_ids),
        )
        .group_by(ContentReport.target_owner_id)
    )
    return dict(rows.all())


def _reads(db: Session, rows: list[tuple[User, UserProfile | None]]) -> list[AdminUserRead]:
    reports = _open_reports(db, [user.id for user, _ in rows])
    return [
        AdminUserRead(
            id=user.id,
            email=user.email,
            display_name=profile.display_name if profile else None,
            avatar_url=profile.avatar_url if profile else None,
            account_role=user.account_role,
            is_active=user.is_active,
            is_verified=user.is_verified,
            branch_id=profile.branch_id if profile else None,
            open_reports=reports.get(user.id, 0),
            created_at=user.created_at,
            last_login_at=user.last_login_at,
        )
        for user, profile in rows
    ]


def _with_profile():
    return select(User, UserProfile).outerjoin(UserProfile, UserProfile.user_id == User.id)


def list_users(
    db: Session,
    user_id: UserId,
    limit: int,
    cursor: str | None,
    *,
    q: str | None = None,
    account_role: AccountRole | None = None,
    is_active: bool | None = None,
    branch_id: uuid.UUID | None = None,
) -> tuple[list[AdminUserRead], str | None]:
    """Users, newest first. ``q`` matches the email or display name."""
    require_staff(db, user_id)
    statement = _with_profile()
    if q:
        pattern = f"%{_escape_like(q)}%"
        statement = statement.where(
            or_(
                User.email.ilike(pattern, escape="\\"),
                UserProfile.display_name.ilike(pattern, escape="\\"),
            )
        )
    if account_role is not None:
        statement = statement.where(User.account_role == account_role)
    if is_active is not None:
        statement = statement.where(User.is_active.is_(is_active))
    if branch_id is not None:
        statement = statement.where(UserProfile.branch_id == branch_id)
    if cursor:
        statement = statement.where(
            pagination.after_cursor(User.created_at, User.id, cursor, newest_first=True)
        )
    statement = statement.order_by(
        *pagination.order_by(User.created_at, User.id, newest_first=True)
    ).limit(limit + 1)
    rows = [tuple(row) for row in db.execute(statement).all()]
    page = rows[:limit]
    next_cursor = (
        pagination.encode_cursor(page[-1][0].created_at, page[-1][0].id)
        if len(rows) > limit
        else None
    )
    return _reads(db, page), next_cursor


def _get_user(db: Session, target_id: uuid.UUID) -> User:
    user = db.get(User, target_id)
    if user is None:
        raise USER_NOT_FOUND
    return user


def _read_one(db: Session, user: User) -> AdminUserRead:
    db.refresh(user)
    return _reads(db, [(user, db.get(UserProfile, user.id))])[0]


def get_user(db: Session, user_id: UserId, target_id: uuid.UUID) -> AdminUserRead:
    require_staff(db, user_id)
    return _read_one(db, _get_user(db, target_id))


def _require_outranks(actor_role: AccountRole, target: User) -> None:
    if STAFF_RANK[actor_role] <= STAFF_RANK[AccountRole(target.account_role)]:
        raise Forbidden("insufficient_role", "You can only act on people ranked below you.")


def change_role(
    db: Session, user_id: UserId, target_id: uuid.UUID, data: AccountRoleUpdate
) -> AdminUserRead:
    _require_admin(db, user_id)
    if target_id == user_id:
        raise InvalidInput("cannot_change_own_role", "Ask another admin to change your role.")
    user = _get_user(db, target_id)
    old_role = AccountRole(user.account_role)
    if old_role != data.account_role:
        user.account_role = data.account_role
        audit.record(
            db,
            user_id,
            "user.role_changed",
            "user",
            user.id,
            data={"from": old_role, "to": data.account_role},
        )
        db.commit()
    return _read_one(db, user)


def suspend_user(
    db: Session, user_id: UserId, target_id: uuid.UUID, data: SuspendRequest
) -> AdminUserRead:
    actor_role = require_staff(db, user_id)
    if target_id == user_id:
        raise InvalidInput("cannot_suspend_self", "You can't suspend yourself.")
    user = _get_user(db, target_id)
    _require_outranks(actor_role, user)
    if not user.is_active:
        raise Conflict("already_suspended", "This account is already inactive.")
    now = _now()
    user.is_active = False
    revoked = db.execute(
        update(RefreshSession)
        .where(RefreshSession.user_id == user.id, RefreshSession.revoked_at.is_(None))
        .values(revoked_at=now)
    ).rowcount
    db.execute(delete(NotificationDevice).where(NotificationDevice.user_id == user.id))
    audit.record(
        db,
        user_id,
        "user.suspended",
        "user",
        user.id,
        data={"reason": data.reason, "sessions_revoked": revoked},
    )
    db.commit()
    return _read_one(db, user)


def reinstate_user(
    db: Session, user_id: UserId, target_id: uuid.UUID, data: ReinstateRequest
) -> AdminUserRead:
    actor_role = require_staff(db, user_id)
    user = _get_user(db, target_id)
    _require_outranks(actor_role, user)
    if user.is_active:
        raise Conflict("not_suspended", "This account is active.")
    user.is_active = True
    audit.record(db, user_id, "user.reinstated", "user", user.id, data={"note": data.note})
    db.commit()
    return _read_one(db, user)


def _count(db: Session, model, *where) -> int:
    return db.scalar(select(func.count()).select_from(model).where(*where))


def overview(db: Session, user_id: UserId) -> AdminOverview:
    require_staff(db, user_id)
    now = _now()
    week_ago = now - timedelta(days=7)
    users = _count(db, User)
    active = _count(db, User, User.is_active.is_(True))
    return AdminOverview(
        users=users,
        active_users=active,
        inactive_users=users - active,
        new_users_last_7_days=_count(db, User, User.created_at >= week_ago),
        communities=_count(db, Community),
        posts_last_7_days=_count(db, Post, Post.created_at >= week_ago),
        open_reports=_count(db, ContentReport, ContentReport.status == ReportStatus.OPEN.value),
        upcoming_events=_count(
            db,
            Event,
            Event.ends_at > now,
            Event.status != EventStatus.CANCELLED.value,
        ),
        branches=_count(db, Branch, Branch.is_active.is_(True)),
    )
