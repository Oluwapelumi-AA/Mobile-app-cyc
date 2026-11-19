"""Running a Chapter: staff, members, announcements and the Chapter dashboard.

- Platform Admins choose each Chapter's Coordinator (one per Chapter).
- Platform Admins make someone an official Member of a Chapter (with a
  department), move them to another Chapter or remove them from it.
- A Chapter's Coordinator (and platform Admins) see its Members, edit their
  profile basics and send announcements to every Member.
- Members are listed for the Chapter's staff and platform staff.
- Staff changes and member removals go in the audit log, and the person is
  told.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.identity import UserId
from app.models.chapter import Chapter
from app.models.chapter_access_request import (
    ChapterAccessRequest,
    ChapterAccessRequestStatus,
)
from app.models.chapter_management import ChapterStaff, ChapterStaffRole, Department
from app.models.event import Event, EventStatus
from app.models.moderation import ChapterBan, ContentReport, ReportStatus
from app.models.post import Post
from app.models.resource import Resource, ResourceStatus
from app.models.user import MembershipStatus, User
from app.models.user_profile import UserProfile
from app.schemas.chapter_management import (
    AnnouncementCreate,
    AnnouncementResult,
    ChapterDashboard,
    ChapterMemberRead,
    DepartmentMemberRead,
    MyStaffRoleRead,
    StaffRead,
)
from app.services import audit, chapter_access, notifications
from app.services.chapter_access import CHAPTER_NOT_FOUND, is_platform_admin
from app.services.errors import Conflict, Forbidden, NotFound

USER_NOT_FOUND = NotFound("user_not_found", "User not found.")
DEPARTMENT_NOT_FOUND = NotFound("department_not_found", "Department not found.")
STAFF_NOT_FOUND = NotFound("staff_not_found", "That user has no staff role in this Chapter.")


def _require_admin(db: Session, actor_id: UserId, message: str) -> None:
    if not is_platform_admin(db, actor_id):
        raise Forbidden("admin_only", message)


# Staff


def _staff_reads(db: Session, rows: list[ChapterStaff]) -> list[StaffRead]:
    ids = [row.user_id for row in rows]
    people = (
        {
            user_id: (email, name)
            for user_id, email, name in db.execute(
                select(User.id, User.email, UserProfile.display_name)
                .outerjoin(UserProfile, UserProfile.user_id == User.id)
                .where(User.id.in_(ids))
            )
        }
        if ids
        else {}
    )
    return [
        StaffRead.model_validate(
            {
                "id": row.id,
                "chapter_id": row.chapter_id,
                "user_id": row.user_id,
                "role": row.role,
                "assigned_by": row.assigned_by,
                "created_at": row.created_at,
                "email": people.get(row.user_id, (None, None))[0],
                "display_name": people.get(row.user_id, (None, None))[1],
            }
        )
        for row in rows
    ]


def list_staff(
    db: Session,
    actor_id: UserId,
    chapter_id: uuid.UUID,
    role: ChapterStaffRole | None = None,
) -> list[StaffRead]:
    """The Chapter's Coordinator."""
    chapter_access.require_read(db, actor_id, chapter_id)
    statement = select(ChapterStaff).where(ChapterStaff.chapter_id == chapter_id)
    if role is not None:
        statement = statement.where(ChapterStaff.role == role.value)
    rows = list(db.scalars(statement.order_by(ChapterStaff.created_at, ChapterStaff.id)))
    rows.sort(key=lambda row: row.role != ChapterStaffRole.COORDINATOR.value)
    return _staff_reads(db, rows)


def assign_staff(
    db: Session,
    actor_id: UserId,
    chapter_id: uuid.UUID,
    target_id: uuid.UUID,
    role: ChapterStaffRole,
) -> StaffRead:
    """Give ``target_id`` a staff role, or change the one they have."""
    _require_admin(db, actor_id, "Only platform Admins can assign Chapter staff.")
    chapter_access.get_chapter(db, chapter_id)
    if db.get(User, target_id) is None:
        raise USER_NOT_FOUND

    if role == ChapterStaffRole.COORDINATOR:
        current = db.scalar(
            select(ChapterStaff).where(
                ChapterStaff.chapter_id == chapter_id,
                ChapterStaff.role == ChapterStaffRole.COORDINATOR.value,
            )
        )
        if current is not None and current.user_id != target_id:
            raise Conflict(
                "coordinator_assignment_conflict",
                "This Chapter already has a Coordinator. Remove them first.",
            )

    assignment = db.scalar(
        select(ChapterStaff).where(
            ChapterStaff.chapter_id == chapter_id,
            ChapterStaff.user_id == target_id,
        )
    )
    if assignment is not None and assignment.role == role.value:
        return _staff_reads(db, [assignment])[0]

    previous = assignment.role if assignment is not None else None
    if assignment is None:
        assignment = ChapterStaff(
            id=uuid.uuid4(),
            chapter_id=chapter_id,
            user_id=target_id,
            role=role.value,
            assigned_by=actor_id,
        )
        db.add(assignment)
    else:
        assignment.role = role.value
        assignment.assigned_by = actor_id

    audit.record(
        db,
        actor_id,
        "chapter_staff.assigned",
        "user",
        target_id,
        chapter_id=chapter_id,
        data={"from": previous, "to": role.value},
    )
    notifications.staff_role_changed(db, chapter_id, target_id, role.value, actor_id)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise Conflict(
            "coordinator_assignment_conflict",
            "This Chapter already has a Coordinator. Remove them first.",
        ) from None
    db.refresh(assignment)
    return _staff_reads(db, [assignment])[0]


def remove_staff(
    db: Session,
    actor_id: UserId,
    chapter_id: uuid.UUID,
    target_id: uuid.UUID,
    role: ChapterStaffRole | None = None,
) -> None:
    """Take away ``target_id``'s staff role (only if it is ``role``, if given)."""
    _require_admin(db, actor_id, "Only platform Admins can remove Chapter staff.")
    statement = select(ChapterStaff).where(
        ChapterStaff.chapter_id == chapter_id,
        ChapterStaff.user_id == target_id,
    )
    if role is not None:
        statement = statement.where(ChapterStaff.role == role.value)
    assignment = db.scalar(statement)
    if assignment is None:
        raise STAFF_NOT_FOUND
    audit.record(
        db,
        actor_id,
        "chapter_staff.removed",
        "user",
        target_id,
        chapter_id=chapter_id,
        data={"role": assignment.role},
    )
    notifications.staff_role_changed(db, chapter_id, target_id, None, actor_id)
    db.delete(assignment)
    db.commit()


def list_my_staff_roles(db: Session, user_id: UserId) -> list[MyStaffRoleRead]:
    """The Chapters the authenticated user coordinates."""
    rows = db.execute(
        select(ChapterStaff.chapter_id, Chapter.name, ChapterStaff.role)
        .join(Chapter, Chapter.id == ChapterStaff.chapter_id)
        .where(ChapterStaff.user_id == user_id)
        .order_by(Chapter.name, Chapter.id)
    ).all()
    return [
        MyStaffRoleRead(chapter_id=chapter_id, chapter_name=name, role=role)
        for chapter_id, name, role in rows
    ]


# Members


def list_members(db: Session, actor_id: UserId, chapter_id: uuid.UUID) -> list[ChapterMemberRead]:
    """Official Members only; Guests are not Chapter Members."""
    chapter_access.require_moderate(db, actor_id, chapter_id)

    rows = db.execute(
        select(User, UserProfile, Department)
        .join(UserProfile, UserProfile.user_id == User.id)
        .outerjoin(Department, Department.id == UserProfile.department_id)
        .where(
            UserProfile.chapter_id == chapter_id,
            User.membership_status == MembershipStatus.MEMBER,
        )
        .order_by(UserProfile.display_name, User.email)
    ).all()
    staff = dict(
        db.execute(
            select(ChapterStaff.user_id, ChapterStaff.role).where(
                ChapterStaff.chapter_id == chapter_id
            )
        ).all()
    )
    banned = set(db.scalars(select(ChapterBan.user_id).where(ChapterBan.chapter_id == chapter_id)))

    return [
        ChapterMemberRead(
            user_id=user.id,
            email=user.email,
            display_name=profile.display_name,
            avatar_url=profile.avatar_url,
            is_active=user.is_active,
            is_verified=user.is_verified,
            department_id=department.id if department else None,
            department_name=department.name if department else None,
            staff_role=staff.get(user.id),
            is_banned=user.id in banned,
            joined_at=profile.created_at,
        )
        for user, profile, department in rows
    ]


def list_chapter_department_members(
    db: Session,
    actor_id: UserId,
    chapter_id: uuid.UUID,
) -> list[DepartmentMemberRead]:
    chapter_access.require_coordinate(db, actor_id, chapter_id)

    rows = db.execute(
        select(User, UserProfile, Department)
        .join(UserProfile, UserProfile.user_id == User.id)
        .outerjoin(Department, Department.id == UserProfile.department_id)
        .where(
            UserProfile.chapter_id == chapter_id,
            User.membership_status == MembershipStatus.MEMBER,
        )
        .order_by(Department.name, UserProfile.display_name, User.email)
    ).all()

    return [
        DepartmentMemberRead(
            user_id=user.id,
            email=user.email,
            display_name=profile.display_name,
            department_id=department.id if department else None,
            department_name=department.name if department else None,
        )
        for user, profile, department in rows
    ]


def assign_member_to_chapter(
    db: Session,
    actor_id: UserId,
    target_id: uuid.UUID,
    chapter_id: uuid.UUID,
    department_id: uuid.UUID | None = None,
) -> None:
    """Atomically convert or reassign a user as an official Chapter Member.
    Without a department, their current one is kept."""
    _require_admin(db, actor_id, "Only platform Admins can assign official Chapter membership.")

    user = db.get(User, target_id)
    if user is None:
        raise USER_NOT_FOUND

    profile = db.get(UserProfile, target_id)
    if profile is None:
        raise NotFound(
            "profile_not_found",
            "The user must create a profile before Member assignment.",
        )

    chapter = db.get(Chapter, chapter_id)
    if chapter is None or not chapter.is_active:
        raise CHAPTER_NOT_FOUND

    if department_id is not None and db.get(Department, department_id) is None:
        raise DEPARTMENT_NOT_FOUND

    now = datetime.now(UTC)
    previous = profile.chapter_id if user.membership_status == MembershipStatus.MEMBER else None

    user.membership_status = MembershipStatus.MEMBER
    profile.chapter_id = chapter_id
    if department_id is not None:
        profile.department_id = department_id

    # A converted Member must not keep outstanding Guest requests.
    for request in db.scalars(
        select(ChapterAccessRequest).where(
            ChapterAccessRequest.user_id == target_id,
            ChapterAccessRequest.status == ChapterAccessRequestStatus.PENDING,
        )
    ):
        request.status = ChapterAccessRequestStatus.CANCELLED
        request.reviewed_by = actor_id
        request.reviewed_at = now
        request.updated_at = now

    audit.record(
        db,
        actor_id,
        "member.assigned",
        "user",
        target_id,
        chapter_id=chapter_id,
        data={"from_chapter_id": previous, "department_id": department_id},
    )
    db.commit()


def remove_member(
    db: Session,
    actor_id: UserId,
    chapter_id: uuid.UUID,
    target_id: uuid.UUID,
) -> None:
    """Take an official Member out of the Chapter; they become a Guest."""
    _require_admin(db, actor_id, "Only platform Admins can change Chapter membership.")
    chapter_access.get_chapter(db, chapter_id)

    user = db.get(User, target_id)
    profile = db.get(UserProfile, target_id)
    if (
        user is None
        or profile is None
        or user.membership_status != MembershipStatus.MEMBER
        or profile.chapter_id != chapter_id
    ):
        raise NotFound("member_not_found", "Official Member not found in this Chapter.")

    profile.chapter_id = None
    profile.department_id = None
    user.membership_status = MembershipStatus.GUEST
    audit.record(
        db,
        actor_id,
        "member.removed",
        "user",
        target_id,
        chapter_id=chapter_id,
        data={},
    )
    notifications.member_removed(db, chapter_id, target_id, actor_id)
    db.commit()


def update_member_profile(
    db: Session,
    actor_id: UserId,
    chapter_id: uuid.UUID,
    target_id: uuid.UUID,
    data,
) -> dict:
    chapter_access.require_coordinate(db, actor_id, chapter_id)

    user = db.get(User, target_id)
    profile = db.get(UserProfile, target_id)

    if (
        user is None
        or user.membership_status != MembershipStatus.MEMBER
        or profile is None
        or profile.chapter_id != chapter_id
    ):
        raise NotFound(
            "member_not_found",
            "Official Member not found in this Chapter.",
        )

    allowed = {"display_name", "bio", "language_code", "country_code", "timezone"}
    for key, value in data.model_dump(exclude_unset=True).items():
        if key in allowed:
            setattr(profile, key, value)

    db.commit()
    db.refresh(profile)

    from app.services.profiles import _to_record

    return _to_record(profile).to_read()


# Announcements and dashboard


def send_announcement(
    db: Session,
    actor_id: UserId,
    chapter_id: uuid.UUID,
    data: AnnouncementCreate,
) -> AnnouncementResult:
    """Notify every active official Member (push and in-app)."""
    chapter_access.require_coordinate(db, actor_id, chapter_id)
    recipients = notifications.chapter_announcement(db, chapter_id, data.title, data.body, actor_id)
    audit.record(
        db,
        actor_id,
        "chapter.announcement_sent",
        "chapter",
        chapter_id,
        chapter_id=chapter_id,
        data={"title": data.title, "recipients": recipients},
    )
    db.commit()
    return AnnouncementResult(chapter_id=chapter_id, recipients=recipients)


def _count(db: Session, model, *conditions) -> int:
    return db.scalar(select(func.count()).select_from(model).where(*conditions)) or 0


def chapter_dashboard(db: Session, actor_id: UserId, chapter_id: uuid.UUID) -> ChapterDashboard:
    """Chapter-scoped summary for its staff and platform staff."""
    role = chapter_access.require_moderate(db, actor_id, chapter_id)
    chapter = chapter_access.get_chapter(db, chapter_id)

    member_count = (
        db.scalar(
            select(func.count())
            .select_from(UserProfile)
            .join(User, User.id == UserProfile.user_id)
            .where(
                UserProfile.chapter_id == chapter_id,
                User.membership_status == MembershipStatus.MEMBER,
            )
        )
        or 0
    )

    return ChapterDashboard(
        chapter_id=chapter.id,
        chapter_name=chapter.name,
        is_active=chapter.is_active,
        member_count=member_count,
        coordinator_count=_count(
            db,
            ChapterStaff,
            ChapterStaff.chapter_id == chapter_id,
            ChapterStaff.role == ChapterStaffRole.COORDINATOR.value,
        ),
        post_count=_count(db, Post, Post.chapter_id == chapter_id),
        upcoming_event_count=_count(
            db,
            Event,
            Event.chapter_id == chapter_id,
            Event.status == EventStatus.SCHEDULED.value,
            Event.ends_at > datetime.now(UTC),
        ),
        published_resource_count=_count(
            db,
            Resource,
            Resource.chapter_id == chapter_id,
            Resource.status == ResourceStatus.PUBLISHED.value,
        ),
        open_report_count=_count(
            db,
            ContentReport,
            ContentReport.chapter_id == chapter_id,
            ContentReport.status == ReportStatus.OPEN.value,
        ),
        pending_access_request_count=_count(
            db,
            ChapterAccessRequest,
            ChapterAccessRequest.chapter_id == chapter_id,
            ChapterAccessRequest.status == ChapterAccessRequestStatus.PENDING,
        ),
        ban_count=_count(db, ChapterBan, ChapterBan.chapter_id == chapter_id),
        my_role=role.value,
        is_platform_admin=is_platform_admin(db, actor_id),
    )
