
"""Authorization and operations for Chapter Coordinators and Departments."""

import uuid

from datetime import datetime, timezone

from app.models.chapter_access_request import (
    ChapterAccessRequest,
    ChapterAccessRequestStatus,
)
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.identity import UserId
from app.models.branch import Branch
from app.models.chapter_access_grant import (
    ChapterAccessGrant,
    ChapterAccessGrantItem,
)
from app.models.chapter_management import BranchCoordinator, Department
from app.models.chapter_content import ChapterPost, ChapterPostComment
from app.models.notification import (
    DeliveryChannel,
    DeliveryStatus,
    Notification,
    NotificationDelivery,
)
from app.models.user import AccountRole, MembershipStatus, User
from app.models.user_profile import UserProfile
from app.schemas.chapter_management import (
    ChapterMemberRead,
    CoordinatorCreate,
    CoordinatorRead,
    DepartmentCreate,
    DepartmentRead,
    DepartmentUpdate,
)
from app.schemas.chapter_content import (
    ChapterPostCreate,
    ChapterCommentCreate,
    ChapterBroadcastCreate,
)
from app.services.errors import Conflict, Forbidden, NotFound


BRANCH_NOT_FOUND = NotFound("branch_not_found", "Chapter not found.")
USER_NOT_FOUND = NotFound("user_not_found", "User not found.")
DEPARTMENT_NOT_FOUND = NotFound("department_not_found", "Department not found.")


def _is_admin(db: Session, user_id: UserId) -> bool:
    return (
        db.scalar(
            select(User.account_role).where(User.id == user_id)
        )
        == AccountRole.ADMIN
    )


def _is_chapter_coordinator(
    db: Session,
    user_id: UserId,
    branch_id: uuid.UUID,
) -> bool:
    return db.scalar(
        select(BranchCoordinator.id).where(
            BranchCoordinator.branch_id == branch_id,
            BranchCoordinator.user_id == user_id,
        )
    ) is not None


def require_chapter_access(
    db: Session,
    user_id: UserId,
    branch_id: uuid.UUID,
) -> None:
    """Require platform Admin or the assigned Chapter Coordinator."""

    if db.get(Branch, branch_id) is None:
        raise BRANCH_NOT_FOUND

    if _is_admin(db, user_id):
        return

    if _is_chapter_coordinator(db, user_id, branch_id):
        return

    raise Forbidden(
        "chapter_access_denied",
        "You can only manage your assigned Chapter.",
    )


def _require_chapter_member_or_manager(
    db: Session,
    actor_id: UserId,
    branch_id: uuid.UUID,
) -> None:
    """Require an official Chapter Member, its Coordinator, or an Admin.

    Guest access is deliberately not included here. Guests receive
    individual read access through ChapterAccessGrantItem instead.
    """

    if db.get(Branch, branch_id) is None:
        raise BRANCH_NOT_FOUND

    if _is_admin(db, actor_id):
        return

    if _is_chapter_coordinator(db, actor_id, branch_id):
        return

    user = db.get(User, actor_id)
    profile = db.get(UserProfile, actor_id)

    if (
        user is not None
        and user.membership_status == MembershipStatus.MEMBER
        and profile is not None
        and profile.branch_id == branch_id
    ):
        return

    raise Forbidden(
        "chapter_access_denied",
        "Only official Members, the assigned Coordinator, or platform Admins can perform this action.",
    )


def _require_chapter_post_read_access(
    db: Session,
    actor_id: UserId,
    post: ChapterPost,
) -> None:
    """Allow a Guest to read a post only when that exact post was granted."""

    if db.get(Branch, post.branch_id) is None:
        raise BRANCH_NOT_FOUND

    if _is_admin(db, actor_id):
        return

    if _is_chapter_coordinator(db, actor_id, post.branch_id):
        return

    user = db.get(User, actor_id)
    if user is None or not user.is_active:
        raise Forbidden("chapter_access_denied", "Chapter content access denied.")

    profile = db.get(UserProfile, actor_id)

    if (
        user.membership_status == MembershipStatus.MEMBER
        and profile is not None
        and profile.branch_id == post.branch_id
    ):
        return

    if user.membership_status == MembershipStatus.GUEST:
        has_grant = db.scalar(
            select(ChapterAccessGrantItem.id)
            .join(
                ChapterAccessGrant,
                ChapterAccessGrant.id == ChapterAccessGrantItem.grant_id,
            )
            .where(
                ChapterAccessGrant.chapter_id == post.branch_id,
                ChapterAccessGrant.user_id == actor_id,
                ChapterAccessGrantItem.chapter_post_id == post.id,
            )
        )

        if has_grant is not None:
            return

    raise Forbidden(
        "chapter_content_access_denied",
        "You do not have access to this Chapter post.",
    )


def assign_coordinator(
    db: Session,
    actor_id: UserId,
    branch_id: uuid.UUID,
    data: CoordinatorCreate,
) -> CoordinatorRead:
    if not _is_admin(db, actor_id):
        raise Forbidden(
            "admin_only",
            "Only platform Admins can assign Coordinators.",
        )

    if db.get(Branch, branch_id) is None:
        raise BRANCH_NOT_FOUND

    user = db.get(User, data.user_id)
    if user is None:
        raise USER_NOT_FOUND

    existing = db.scalar(
        select(BranchCoordinator).where(
            BranchCoordinator.branch_id == branch_id,
            BranchCoordinator.user_id == data.user_id,
        )
    )

    if existing:
        return CoordinatorRead.model_validate(existing)

    assignment = BranchCoordinator(
        id=uuid.uuid4(),
        branch_id=branch_id,
        user_id=data.user_id,
        assigned_by=actor_id,
    )

    db.add(assignment)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise Conflict(
            "coordinator_assignment_conflict",
            "A Coordinator is already assigned to this Chapter.",
        ) from None

    db.refresh(assignment)
    return CoordinatorRead.model_validate(assignment)


def remove_coordinator(
    db: Session,
    actor_id: UserId,
    branch_id: uuid.UUID,
    target_id: uuid.UUID,
) -> None:
    if not _is_admin(db, actor_id):
        raise Forbidden(
            "admin_only",
            "Only platform Admins can remove Coordinators.",
        )

    assignment = db.scalar(
        select(BranchCoordinator).where(
            BranchCoordinator.branch_id == branch_id,
            BranchCoordinator.user_id == target_id,
        )
    )

    if assignment is None:
        raise NotFound(
            "coordinator_not_found",
            "Coordinator assignment not found.",
        )

    db.delete(assignment)
    db.commit()


def list_coordinators(
    db: Session,
    actor_id: UserId,
    branch_id: uuid.UUID,
) -> list[CoordinatorRead]:
    require_chapter_access(db, actor_id, branch_id)

    rows = db.scalars(
        select(BranchCoordinator)
        .where(BranchCoordinator.branch_id == branch_id)
        .order_by(BranchCoordinator.created_at, BranchCoordinator.id)
    )

    return [CoordinatorRead.model_validate(row) for row in rows]


def list_members(
    db: Session,
    actor_id: UserId,
    branch_id: uuid.UUID,
) -> list[ChapterMemberRead]:
    """List official Members only; Guests are not Chapter Members."""

    require_chapter_access(db, actor_id, branch_id)

    rows = db.execute(
        select(User, UserProfile)
        .join(UserProfile, UserProfile.user_id == User.id)
        .where(
            UserProfile.branch_id == branch_id,
            User.membership_status == MembershipStatus.MEMBER,
        )
        .order_by(UserProfile.display_name, User.email)
    ).all()

    return [
        ChapterMemberRead(
            user_id=user.id,
            email=user.email,
            display_name=profile.display_name,
            avatar_url=profile.avatar_url,
            is_active=user.is_active,
            is_verified=user.is_verified,
            joined_at=profile.created_at,
        )
        for user, profile in rows
    ]


def list_departments(
    db: Session,
    actor_id: UserId,
) -> list[DepartmentRead]:
    if not _is_admin(db, actor_id):
        raise Forbidden(
            "admin_only",
            "Only platform Admins can view the global Department list.",
        )

    rows = db.scalars(
        select(Department).order_by(Department.name, Department.id)
    )

    return [DepartmentRead.model_validate(row) for row in rows]


def create_department(
    db: Session,
    actor_id: UserId,
    data: DepartmentCreate,
) -> DepartmentRead:
    if not _is_admin(db, actor_id):
        raise Forbidden(
            "admin_only",
            "Only platform Admins can manage global Departments.",
        )

    department = Department(
        id=uuid.uuid4(),
        name=data.name,
        description=data.description or None,
        created_by=actor_id,
    )

    db.add(department)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise Conflict(
            "department_name_exists",
            "A global Department with that name already exists.",
        ) from None

    db.refresh(department)
    return DepartmentRead.model_validate(department)


def _department(
    db: Session,
    department_id: uuid.UUID,
) -> Department:
    row = db.get(Department, department_id)

    if row is None:
        raise DEPARTMENT_NOT_FOUND

    return row


def update_department(
    db: Session,
    actor_id: UserId,
    department_id: uuid.UUID,
    data: DepartmentUpdate,
) -> DepartmentRead:
    if not _is_admin(db, actor_id):
        raise Forbidden(
            "admin_only",
            "Only platform Admins can manage global Departments.",
        )

    row = _department(db, department_id)

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(row, key, value or None if key == "description" else value)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise Conflict(
            "department_name_exists",
            "A global Department with that name already exists.",
        ) from None

    db.refresh(row)
    return DepartmentRead.model_validate(row)


def delete_department(
    db: Session,
    actor_id: UserId,
    department_id: uuid.UUID,
) -> None:
    if not _is_admin(db, actor_id):
        raise Forbidden(
            "admin_only",
            "Only platform Admins can manage global Departments.",
        )

    row = _department(db, department_id)
    db.delete(row)
    db.commit()


def assign_member_department(
    db: Session,
    actor_id: UserId,
    target_id: uuid.UUID,
    department_id: uuid.UUID | None,
) -> DepartmentRead | None:
    if not _is_admin(db, actor_id):
        raise Forbidden(
            "admin_only",
            "Only platform Admins can assign or remove Member Departments.",
        )

    user = db.get(User, target_id)
    if user is None:
        raise USER_NOT_FOUND

    if user.membership_status != MembershipStatus.MEMBER:
        raise Conflict(
            "user_not_member",
            "Departments can only be assigned to official Members.",
        )

    profile = db.get(UserProfile, target_id)
    if profile is None:
        raise NotFound(
            "profile_not_found",
            "The user must create a profile before Department assignment.",
        )

    department = None

    if department_id is not None:
        department = db.get(Department, department_id)
        if department is None:
            raise DEPARTMENT_NOT_FOUND

    profile.department_id = department_id
    db.commit()

    return DepartmentRead.model_validate(department) if department else None


def list_chapter_department_members(
    db: Session,
    actor_id: UserId,
    branch_id: uuid.UUID,
) -> list:
    require_chapter_access(db, actor_id, branch_id)

    rows = db.execute(
        select(User, UserProfile, Department)
        .join(UserProfile, UserProfile.user_id == User.id)
        .outerjoin(Department, Department.id == UserProfile.department_id)
        .where(
            UserProfile.branch_id == branch_id,
            User.membership_status == MembershipStatus.MEMBER,
        )
        .order_by(
            Department.name,
            UserProfile.display_name,
            User.email,
        )
    ).all()

    from app.schemas.chapter_management import DepartmentMemberRead

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


def reassign_member(
    db: Session,
    actor_id: UserId,
    target_id: uuid.UUID,
    branch_id: uuid.UUID | None,
) -> None:
    if not _is_admin(db, actor_id):
        raise Forbidden(
            "admin_only",
            "Only platform Admins can change Chapter membership.",
        )

    user = db.get(User, target_id)
    if user is None:
        raise USER_NOT_FOUND

    if user.membership_status != MembershipStatus.MEMBER:
        raise Conflict(
            "user_not_member",
            "Only official Members can be reassigned to a Chapter.",
        )

    profile = db.get(UserProfile, target_id)
    if profile is None:
        raise NotFound(
            "profile_not_found",
            "The user must create a profile before Chapter assignment.",
        )

    if branch_id is not None:
        branch = db.get(Branch, branch_id)

        if branch is None or not branch.is_active:
            raise NotFound(
                "branch_not_found",
                "An active Chapter is required.",
            )

    profile.branch_id = branch_id
    db.commit()


def update_member_profile(
    db: Session,
    actor_id: UserId,
    branch_id: uuid.UUID,
    target_id: uuid.UUID,
    data,
) -> dict:
    require_chapter_access(db, actor_id, branch_id)

    user = db.get(User, target_id)
    profile = db.get(UserProfile, target_id)

    if (
        user is None
        or user.membership_status != MembershipStatus.MEMBER
        or profile is None
        or profile.branch_id != branch_id
    ):
        raise NotFound(
            "member_not_found",
            "Official Member not found in this Chapter.",
        )

    changes = data.model_dump(exclude_unset=True)

    for key, value in changes.items():
        if key not in {
            "display_name",
            "bio",
            "language_code",
            "country_code",
            "timezone",
        }:
            continue

        setattr(profile, key, value)

    db.commit()
    db.refresh(profile)

    return {
        "user_id": target_id,
        "email": user.email,
        "display_name": profile.display_name,
        "bio": profile.bio,
        "avatar_url": profile.avatar_url,
        "language_code": profile.language_code,
        "country_code": profile.country_code,
        "timezone": profile.timezone,
        "branch_id": profile.branch_id,
        "created_at": profile.created_at,
        "updated_at": profile.updated_at,
    }


def _chapter_post(
    db: Session,
    post_id: uuid.UUID,
) -> ChapterPost:
    post = db.get(ChapterPost, post_id)

    if post is None:
        raise NotFound(
            "chapter_post_not_found",
            "Chapter post not found.",
        )

    return post


def list_chapter_posts(
    db: Session,
    actor_id: UserId,
    branch_id: uuid.UUID,
) -> list[ChapterPost]:
    if db.get(Branch, branch_id) is None:
        raise BRANCH_NOT_FOUND

    if _is_admin(db, actor_id) or _is_chapter_coordinator(
        db,
        actor_id,
        branch_id,
    ):
        statement = select(ChapterPost).where(
            ChapterPost.branch_id == branch_id
        )
    else:
        user = db.get(User, actor_id)
        profile = db.get(UserProfile, actor_id)

        if user is None or not user.is_active:
            raise Forbidden(
                "chapter_access_denied",
                "Chapter content access denied.",
            )

        if (
            user.membership_status == MembershipStatus.MEMBER
            and profile is not None
            and profile.branch_id == branch_id
        ):
            statement = select(ChapterPost).where(
                ChapterPost.branch_id == branch_id
            )

        elif user.membership_status == MembershipStatus.GUEST:
            granted_post_ids = (
                select(ChapterAccessGrantItem.chapter_post_id)
                .join(
                    ChapterAccessGrant,
                    ChapterAccessGrant.id == ChapterAccessGrantItem.grant_id,
                )
                .where(
                    ChapterAccessGrant.chapter_id == branch_id,
                    ChapterAccessGrant.user_id == actor_id,
                    ChapterAccessGrantItem.chapter_post_id.is_not(None),
                )
            )

            statement = select(ChapterPost).where(
                ChapterPost.branch_id == branch_id,
                ChapterPost.id.in_(granted_post_ids),
            )

        else:
            raise Forbidden(
                "chapter_access_denied",
                "You do not have access to this Chapter.",
            )

    return list(
        db.scalars(
            statement.order_by(
                ChapterPost.created_at.desc(),
                ChapterPost.id,
            )
        )
    )


def create_chapter_post(
    db: Session,
    actor_id: UserId,
    branch_id: uuid.UUID,
    data: ChapterPostCreate,
) -> ChapterPost:
    _require_chapter_member_or_manager(db, actor_id, branch_id)

    post = ChapterPost(
        id=uuid.uuid4(),
        branch_id=branch_id,
        author_id=actor_id,
        body=data.body,
    )

    db.add(post)
    db.commit()
    db.refresh(post)

    return post


def _require_post_chapter(
    db: Session,
    actor_id: UserId,
    post_id: uuid.UUID,
) -> ChapterPost:
    post = _chapter_post(db, post_id)
    _require_chapter_post_read_access(db, actor_id, post)
    return post


def list_chapter_comments(
    db: Session,
    actor_id: UserId,
    post_id: uuid.UUID,
) -> list[ChapterPostComment]:
    post = _require_post_chapter(db, actor_id, post_id)

    return list(
        db.scalars(
            select(ChapterPostComment)
            .where(ChapterPostComment.post_id == post.id)
            .order_by(
                ChapterPostComment.created_at,
                ChapterPostComment.id,
            )
        )
    )


def create_chapter_comment(
    db: Session,
    actor_id: UserId,
    post_id: uuid.UUID,
    data: ChapterCommentCreate,
) -> ChapterPostComment:
    post = _require_post_chapter(db, actor_id, post_id)

    # Guests have read-only access to individually granted posts.
    _require_chapter_member_or_manager(
        db,
        actor_id,
        post.branch_id,
    )

    comment = ChapterPostComment(
        id=uuid.uuid4(),
        post_id=post.id,
        author_id=actor_id,
        body=data.body,
    )

    db.add(comment)
    db.commit()
    db.refresh(comment)

    return comment


def delete_chapter_comment(
    db: Session,
    actor_id: UserId,
    post_id: uuid.UUID,
    comment_id: uuid.UUID,
) -> None:
    post = _require_post_chapter(db, actor_id, post_id)

    comment = db.get(ChapterPostComment, comment_id)

    if comment is None or comment.post_id != post.id:
        raise NotFound(
            "chapter_comment_not_found",
            "Comment not found on this Chapter post.",
        )

    if not _is_admin(db, actor_id) and not _is_chapter_coordinator(
        db,
        actor_id,
        post.branch_id,
    ):
        raise Forbidden(
            "coordinator_only",
            "Only Chapter Coordinators or platform Admins can delete comments.",
        )

    db.delete(comment)
    db.commit()


def delete_chapter_post(
    db: Session,
    actor_id: UserId,
    post_id: uuid.UUID,
) -> None:
    """Allow assigned Coordinators and platform Admins to moderate posts."""

    post = _require_post_chapter(db, actor_id, post_id)

    if not _is_admin(db, actor_id) and not _is_chapter_coordinator(
        db,
        actor_id,
        post.branch_id,
    ):
        raise Forbidden(
            "coordinator_only",
            "Only the assigned Chapter Coordinator or a platform Admin can delete posts.",
        )

    db.delete(post)
    db.commit()


def broadcast_chapter_push(
    db: Session,
    actor_id: UserId,
    branch_id: uuid.UUID,
    data: ChapterBroadcastCreate,
) -> dict:
    require_chapter_access(db, actor_id, branch_id)

    # General Chapter announcements go to official Members only.
    # Guest access remains limited to individually granted content.
    member_ids = list(
        db.scalars(
            select(UserProfile.user_id)
            .join(User, User.id == UserProfile.user_id)
            .where(
                UserProfile.branch_id == branch_id,
                User.membership_status == MembershipStatus.MEMBER,
                User.is_active.is_(True),
            )
        )
    )

    created = 0

    for member_id in member_ids:
        notification = Notification(
            id=uuid.uuid4(),
            user_id=member_id,
            actor_id=actor_id,
            type="chapter_announcement",
            category="community",
            title=data.title,
            body=data.body,
            data={
                "branch_id": str(branch_id),
                "kind": "chapter_announcement",
            },
        )

        db.add(notification)
        db.flush()

        db.add(
            NotificationDelivery(
                id=uuid.uuid4(),
                notification_id=notification.id,
                channel=DeliveryChannel.PUSH.value,
                status=DeliveryStatus.PENDING.value,
            )
        )

        created += 1

    db.commit()

    return {
        "branch_id": branch_id,
        "recipients": created,
    }


def chapter_dashboard(
    db: Session,
    actor_id: UserId,
    branch_id: uuid.UUID,
) -> dict:
    """Chapter-scoped dashboard summary for Admins and Coordinators."""

    require_chapter_access(db, actor_id, branch_id)

    branch = db.get(Branch, branch_id)

    member_count = (
        db.scalar(
            select(func.count())
            .select_from(UserProfile)
            .join(User, User.id == UserProfile.user_id)
            .where(
                UserProfile.branch_id == branch_id,
                User.membership_status == MembershipStatus.MEMBER,
            )
        )
        or 0
    )

    coordinator_count = (
        db.scalar(
            select(func.count())
            .select_from(BranchCoordinator)
            .where(BranchCoordinator.branch_id == branch_id)
        )
        or 0
    )

    post_count = (
        db.scalar(
            select(func.count())
            .select_from(ChapterPost)
            .where(ChapterPost.branch_id == branch_id)
        )
        or 0
    )

    return {
        "branch_id": branch.id,
        "branch_name": branch.name,
        "member_count": member_count,
        "coordinator_count": coordinator_count,
        "post_count": post_count,
        "is_platform_admin": _is_admin(db, actor_id),
    }


def list_my_coordinator_assignments(
    db: Session,
    user_id: UserId,
) -> list[dict]:
    """Return only the authenticated user's Coordinator assignments."""

    rows = db.execute(
        select(BranchCoordinator.branch_id, Branch.name)
        .join(Branch, Branch.id == BranchCoordinator.branch_id)
        .where(BranchCoordinator.user_id == user_id)
        .order_by(Branch.name, Branch.id)
    ).all()

    return [
        {
            "branch_id": branch_id,
            "branch_name": branch_name,
        }
        for branch_id, branch_name in rows
    ]
def assign_member_to_chapter(
    db: Session,
    actor_id: UserId,
    target_id: uuid.UUID,
    branch_id: uuid.UUID,
    department_id: uuid.UUID,
) -> None:
    """Atomically convert or reassign a user as an official Chapter Member."""

    if not _is_admin(db, actor_id):
        raise Forbidden(
            "admin_only",
            "Only platform Admins can assign official Chapter membership.",
        )

    user = db.get(User, target_id)
    if user is None:
        raise USER_NOT_FOUND

    profile = db.get(UserProfile, target_id)
    if profile is None:
        raise NotFound(
            "profile_not_found",
            "The user must create a profile before Member assignment.",
        )

    chapter = db.get(Branch, branch_id)
    if chapter is None or not chapter.is_active:
        raise BRANCH_NOT_FOUND

    department = db.get(Department, department_id)
    if department is None:
        raise DEPARTMENT_NOT_FOUND

    now = datetime.now(timezone.utc)

    try:
        user.membership_status = MembershipStatus.MEMBER
        profile.branch_id = branch_id
        profile.department_id = department_id

        # A converted Member must not retain outstanding Guest requests.
        pending_requests = db.scalars(
            select(ChapterAccessRequest).where(
                ChapterAccessRequest.user_id == target_id,
                ChapterAccessRequest.status
                == ChapterAccessRequestStatus.PENDING,
            )
        ).all()

        for request in pending_requests:
            request.status = ChapterAccessRequestStatus.CANCELLED
            request.reviewed_by = actor_id
            request.reviewed_at = now
            request.updated_at = now

        db.commit()

    except Exception:
        db.rollback()
        raise
