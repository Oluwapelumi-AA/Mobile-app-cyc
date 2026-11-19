"""Deleting your own account (required by the App Store and Google Play).

The account is anonymised rather than erased, so conversations other people
took part in still make sense:

- email, password, name, photo, bio, location and language are wiped; the
  email is freed so it can sign up again;
- the user is signed out everywhere, their devices stop getting push
  notifications, and they lose every Chapter and app-wide role;
- their posts and comments stay, shown as "Deleted user".

The last active Admin can't delete their account.
"""

import secrets
import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.models.chapter_access_request import (
    ChapterAccessRequest,
    ChapterAccessRequestStatus,
)
from app.models.chapter_management import ChapterStaff
from app.models.notification import NotificationDevice
from app.models.refresh_session import RefreshSession
from app.models.user import AccountRole, MembershipStatus, User
from app.models.user_profile import UserProfile
from app.services import audit
from app.services.errors import Conflict, InvalidInput, NotFound

DELETED_NAME = "Deleted user"


def deleted_email(user_id: uuid.UUID) -> str:
    return f"deleted-{user_id.hex}@deleted.invalid"


def delete_account(db: Session, user_id: uuid.UUID, password: str) -> None:
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise NotFound("user_not_found", "Account not found.")
    if not verify_password(password, user.password_hash):
        raise InvalidInput("wrong_password", "Your password is wrong.")
    if user.account_role == AccountRole.ADMIN:
        other_admin = db.scalar(
            select(User.id)
            .where(
                User.account_role == AccountRole.ADMIN,
                User.is_active.is_(True),
                User.id != user.id,
            )
            .limit(1)
        )
        if other_admin is None:
            raise Conflict(
                "last_admin", "You're the only admin. Make someone else an admin first."
            )

    now = datetime.now(UTC)
    staff_chapters = list(db.scalars(select(ChapterStaff.chapter_id).where(ChapterStaff.user_id == user.id)))

    user.email = deleted_email(user.id)
    user.password_hash = hash_password(secrets.token_urlsafe(32))
    user.is_active = False
    user.is_verified = False
    user.account_role = AccountRole.USER
    user.membership_status = MembershipStatus.GUEST

    profile = db.get(UserProfile, user.id)
    if profile is not None:
        profile.display_name = DELETED_NAME
        profile.bio = None
        profile.avatar_url = None
        profile.city = None
        profile.country_code = None
        profile.timezone = None
        profile.language_code = None
        profile.chapter_id = None
        profile.department_id = None
        profile.preferred_chapter_id = None

    db.execute(delete(ChapterStaff).where(ChapterStaff.user_id == user.id))
    db.execute(delete(NotificationDevice).where(NotificationDevice.user_id == user.id))
    for session in db.scalars(
        select(RefreshSession).where(
            RefreshSession.user_id == user.id, RefreshSession.revoked_at.is_(None)
        )
    ):
        session.revoked_at = now
    for request in db.scalars(
        select(ChapterAccessRequest).where(
            ChapterAccessRequest.user_id == user.id,
            ChapterAccessRequest.status == ChapterAccessRequestStatus.PENDING,
        )
    ):
        request.status = ChapterAccessRequestStatus.CANCELLED
        request.reviewed_at = now
        request.updated_at = now

    audit.record(db, user.id, "user.deleted_account", "user", user.id)
    for chapter_id in staff_chapters:
        audit.record(
            db, user.id, "chapter_staff.removed", "user", user.id,
            chapter_id=chapter_id, data={"reason": "account_deleted"},
        )
    db.commit()
