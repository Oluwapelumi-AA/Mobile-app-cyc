
"""Selective Chapter content access grant operations."""

import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.identity import UserId
from app.models.branch import Branch
from app.models.chapter_access_grant import (
    ChapterAccessGrant,
    ChapterAccessGrantItem,
)
from app.models.chapter_access_request import (
    ChapterAccessRequest,
    ChapterAccessRequestStatus,
)
from app.models.chapter_content import ChapterPost
from app.models.event import Event
from app.models.meeting import Meeting
from app.models.resource import Resource
from app.models.user import MembershipStatus, User
from app.schemas.chapter_access_grant import (
    ChapterAccessGrantCreate,
    ChapterAccessGrantItemRead,
    ChapterAccessGrantRead,
)
from app.services.chapter_management import require_chapter_access
from app.services.errors import Conflict, Forbidden, NotFound


_CONTENT_MODELS = {
    "chapter_post_id": ChapterPost,
    "event_id": Event,
    "meeting_id": Meeting,
    "resource_id": Resource,
}


def _item_key(item: ChapterAccessGrantItem) -> tuple[str, uuid.UUID]:
    """Return the populated content target for an existing grant item."""

    for field in _CONTENT_MODELS:
        value = getattr(item, field)

        if value is not None:
            return field, value

    raise Conflict(
        "invalid_grant_item",
        "A stored access grant item has no valid content target.",
    )


def _validate_content_ownership(
    db: Session,
    chapter_id: uuid.UUID,
    field: str,
    content_id: uuid.UUID,
) -> None:
    """Ensure the selected content belongs to the requested Chapter."""

    model = _CONTENT_MODELS[field]
    content = db.get(model, content_id)

    if content is None:
        raise NotFound(
            "chapter_content_not_found",
            "The selected Chapter content item was not found.",
        )

    if field == "chapter_post_id":
        owner_chapter_id = content.branch_id
    else:
        owner_chapter_id = content.chapter_id

    if owner_chapter_id != chapter_id:
        raise Forbidden(
            "chapter_content_access_denied",
            "You can only grant content belonging to this Chapter.",
        )


def _serialize_grant(
    db: Session,
    grant: ChapterAccessGrant,
) -> ChapterAccessGrantRead:
    """Build the response without requiring an ORM relationship."""

    items = db.scalars(
        select(ChapterAccessGrantItem)
        .where(ChapterAccessGrantItem.grant_id == grant.id)
        .order_by(
            ChapterAccessGrantItem.created_at,
            ChapterAccessGrantItem.id,
        )
    ).all()

    return ChapterAccessGrantRead(
        id=grant.id,
        chapter_id=grant.chapter_id,
        user_id=grant.user_id,
        granted_by=grant.granted_by,
        created_at=grant.created_at,
        items=[
            ChapterAccessGrantItemRead.model_validate(item)
            for item in items
        ],
    )


def grant_chapter_content(
    db: Session,
    actor_id: UserId,
    chapter_id: uuid.UUID,
    data: ChapterAccessGrantCreate,
) -> ChapterAccessGrantRead:
    """Grant or extend selective Chapter content access for an approved Guest."""

    # Admins have global access; Coordinators are restricted to their
    # assigned Chapter by this shared authorization function.
    require_chapter_access(db, actor_id, chapter_id)

    chapter = db.get(Branch, chapter_id)

    if chapter is None or not chapter.is_active:
        raise NotFound(
            "chapter_not_found",
            "Active Chapter not found.",
        )

    guest = db.get(User, data.user_id)

    if guest is None or not guest.is_active:
        raise NotFound(
            "user_not_found",
            "Active user not found.",
        )

    if guest.membership_status != MembershipStatus.GUEST:
        raise Conflict(
            "user_not_guest",
            "Selective Chapter content grants are only for Guest accounts.",
        )

    approved_request = db.scalar(
        select(ChapterAccessRequest.id).where(
            ChapterAccessRequest.chapter_id == chapter_id,
            ChapterAccessRequest.user_id == data.user_id,
            ChapterAccessRequest.status
            == ChapterAccessRequestStatus.APPROVED,
        )
    )

    if approved_request is None:
        raise Forbidden(
            "chapter_access_request_not_approved",
            "The Guest must have an approved access request for this Chapter.",
        )

    # Validate every requested item before making any database changes.
    requested_items: list[tuple[str, uuid.UUID]] = []

    for item in data.items:
        populated = [
            (field, getattr(item, field))
            for field in _CONTENT_MODELS
            if getattr(item, field) is not None
        ]

        if len(populated) != 1:
            raise Conflict(
                "invalid_grant_item",
                "Each grant item must contain exactly one content target.",
            )

        field, content_id = populated[0]

        _validate_content_ownership(
            db,
            chapter_id,
            field,
            content_id,
        )

        requested_items.append((field, content_id))

    grant = db.scalar(
        select(ChapterAccessGrant).where(
            ChapterAccessGrant.chapter_id == chapter_id,
            ChapterAccessGrant.user_id == data.user_id,
        )
    )

    is_new_grant = grant is None

    if grant is None:
        grant = ChapterAccessGrant(
            id=uuid.uuid4(),
            chapter_id=chapter_id,
            user_id=data.user_id,
            granted_by=actor_id,
        )
        db.add(grant)
        db.flush()

    existing_items = db.scalars(
        select(ChapterAccessGrantItem).where(
            ChapterAccessGrantItem.grant_id == grant.id
        )
    ).all()

    existing_keys = {
        _item_key(item)
        for item in existing_items
    }

    added_count = 0

    for field, content_id in requested_items:
        key = (field, content_id)

        if key in existing_keys:
            continue

        grant_item = ChapterAccessGrantItem(
            id=uuid.uuid4(),
            grant_id=grant.id,
            **{field: content_id},
        )

        db.add(grant_item)
        existing_keys.add(key)
        added_count += 1

    if is_new_grant or added_count:
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise Conflict(
                "chapter_access_grant_conflict",
                "The Chapter content grant could not be saved.",
            ) from None

        db.refresh(grant)

    return _serialize_grant(db, grant)


def list_guest_chapter_grants(
    db: Session,
    actor_id: UserId,
    chapter_id: uuid.UUID,
) -> list[ChapterAccessGrantRead]:
    """List selective content grants for Guests in a Chapter."""

    require_chapter_access(db, actor_id, chapter_id)

    grants = db.scalars(
        select(ChapterAccessGrant)
        .where(ChapterAccessGrant.chapter_id == chapter_id)
        .order_by(
            ChapterAccessGrant.created_at.desc(),
            ChapterAccessGrant.id,
        )
    ).all()

    return [
        _serialize_grant(db, grant)
        for grant in grants
    ]


def list_my_chapter_grants(
    db: Session,
    user_id: UserId,
) -> list[ChapterAccessGrantRead]:
    """List the authenticated Guest's selective Chapter content grants."""

    grants = db.scalars(
        select(ChapterAccessGrant)
        .where(ChapterAccessGrant.user_id == user_id)
        .order_by(
            ChapterAccessGrant.created_at.desc(),
            ChapterAccessGrant.id,
        )
    ).all()

    return [
        _serialize_grant(db, grant)
        for grant in grants
    ]
