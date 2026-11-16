
"""Chapter access request operations."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.identity import UserId
from app.models.branch import Branch
from app.models.chapter_access_request import (
    ChapterAccessRequest,
    ChapterAccessRequestStatus,
)
from app.models.chapter_management import BranchCoordinator
from app.models.user import AccountRole, User, MembershipStatus
from app.models.user_profile import UserProfile
from app.schemas.chapter_access_request import (
    ChapterAccessRequestRead,
)
from app.services.errors import Conflict, Forbidden, NotFound


def _is_admin(db: Session, user_id: UserId) -> bool:
    return (
        db.scalar(
            select(User.account_role).where(User.id == user_id)
        )
        == AccountRole.ADMIN
    )


def _require_chapter_coordinator(
    db: Session,
    actor_id: UserId,
    chapter_id: uuid.UUID,
) -> None:
    if db.get(Branch, chapter_id) is None:
        raise NotFound("chapter_not_found", "Chapter not found.")

    if _is_admin(db, actor_id):
        return

    assigned = db.scalar(
        select(BranchCoordinator.id).where(
            BranchCoordinator.branch_id == chapter_id,
            BranchCoordinator.user_id == actor_id,
        )
    )

    if assigned is None:
        raise Forbidden(
            "chapter_access_denied",
            "You can only review requests for your assigned Chapter.",
        )


def create_access_request(
    db: Session,
    user_id: UserId,
    chapter_id: uuid.UUID,
) -> ChapterAccessRequestRead:
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise NotFound("user_not_found", "Active user not found.")

    profile = db.get(UserProfile, user_id)
    if profile is None:
        raise NotFound(
            "profile_not_found",
            "Create your profile before requesting Chapter access.",
        )

    chapter = db.get(Branch, chapter_id)
    if chapter is None or not chapter.is_active:
        raise NotFound("chapter_not_found", "Active Chapter not found.")

    if user.membership_status == MembershipStatus.MEMBER:
        raise Conflict(
            "already_a_member",
            "Members cannot submit Guest access requests.",
        )

    if profile.branch_id == chapter_id:
        raise Conflict(
            "already_assigned",
            "You are already officially assigned to this Chapter.",
        )

    existing = db.scalar(
        select(ChapterAccessRequest).where(
            ChapterAccessRequest.chapter_id == chapter_id,
            ChapterAccessRequest.user_id == user_id,
            ChapterAccessRequest.status == ChapterAccessRequestStatus.PENDING,
        )
    )

    if existing is not None:
        return ChapterAccessRequestRead.model_validate(existing)

    request = ChapterAccessRequest(
        id=uuid.uuid4(),
        chapter_id=chapter_id,
        user_id=user_id,
        status=ChapterAccessRequestStatus.PENDING,
    )

    previous_preference = profile.preferred_chapter_id
    profile.preferred_chapter_id = chapter_id
    db.add(request)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()

        # A concurrent submission may have created the pending request.
        existing = db.scalar(
            select(ChapterAccessRequest).where(
                ChapterAccessRequest.chapter_id == chapter_id,
                ChapterAccessRequest.user_id == user_id,
                ChapterAccessRequest.status == ChapterAccessRequestStatus.PENDING,
            )
        )
        if existing is not None:
            return ChapterAccessRequestRead.model_validate(existing)

        raise Conflict(
            "chapter_request_conflict",
            "The Chapter request could not be submitted.",
        ) from None

    db.refresh(request)
    return ChapterAccessRequestRead.model_validate(request)


def list_my_access_requests(
    db: Session,
    user_id: UserId,
) -> list[ChapterAccessRequestRead]:
    rows = db.scalars(
        select(ChapterAccessRequest)
        .where(ChapterAccessRequest.user_id == user_id)
        .order_by(
            ChapterAccessRequest.created_at.desc(),
            ChapterAccessRequest.id.desc(),
        )
    )

    return [
        ChapterAccessRequestRead.model_validate(row)
        for row in rows
    ]


def list_chapter_access_requests(
    db: Session,
    actor_id: UserId,
    chapter_id: uuid.UUID,
    status: ChapterAccessRequestStatus | None = None,
) -> list[ChapterAccessRequestRead]:
    _require_chapter_coordinator(db, actor_id, chapter_id)

    statement = select(ChapterAccessRequest).where(
        ChapterAccessRequest.chapter_id == chapter_id
    )

    if status is not None:
        statement = statement.where(
            ChapterAccessRequest.status == status
        )

    rows = db.scalars(
        statement.order_by(
            ChapterAccessRequest.created_at.desc(),
            ChapterAccessRequest.id.desc(),
        )
    )

    return [
        ChapterAccessRequestRead.model_validate(row)
        for row in rows
    ]


def review_access_request(
    db: Session,
    actor_id: UserId,
    request_id: uuid.UUID,
    decision: ChapterAccessRequestStatus,
) -> ChapterAccessRequestRead:
    if decision not in {
        ChapterAccessRequestStatus.APPROVED,
        ChapterAccessRequestStatus.DECLINED,
    }:
        raise Conflict(
            "invalid_request_decision",
            "A request can only be approved or declined during review.",
        )

    request = db.get(ChapterAccessRequest, request_id)
    if request is None:
        raise NotFound(
            "chapter_request_not_found",
            "Chapter access request not found.",
        )

    _require_chapter_coordinator(
        db,
        actor_id,
        request.chapter_id,
    )

    if request.status != ChapterAccessRequestStatus.PENDING:
        raise Conflict(
            "chapter_request_not_pending",
            "Only pending requests can be reviewed.",
        )

    user = db.get(User, request.user_id)
    if user is None or not user.is_active:
        raise NotFound(
            "user_not_found",
            "The requesting user is no longer active.",
        )

    request.status = decision
    request.reviewed_by = actor_id
    request.reviewed_at = datetime.now(UTC)
    request.updated_at = datetime.now(UTC)

    db.commit()
    db.refresh(request)

    return ChapterAccessRequestRead.model_validate(request)


def cancel_access_request(
    db: Session,
    user_id: UserId,
    request_id: uuid.UUID,
) -> ChapterAccessRequestRead:
    request = db.get(ChapterAccessRequest, request_id)

    if request is None or request.user_id != user_id:
        raise NotFound(
            "chapter_request_not_found",
            "Chapter access request not found.",
        )

    if request.status != ChapterAccessRequestStatus.PENDING:
        raise Conflict(
            "chapter_request_not_pending",
            "Only pending requests can be cancelled.",
        )

    request.status = ChapterAccessRequestStatus.CANCELLED
    request.updated_at = datetime.now(UTC)

    db.commit()
    db.refresh(request)

    return ChapterAccessRequestRead.model_validate(request)
