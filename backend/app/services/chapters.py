
"""Chapter directory and platform administration."""

import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.identity import UserId
from app.models.chapter import Chapter
from app.models.chapter_management import ChapterStaff
from app.models.user import AccountRole, MembershipStatus, User
from app.models.user_profile import UserProfile
from app.schemas.chapter import ChapterCreate, ChapterLeader, ChapterRead, ChapterUpdate
from app.services import audit, chapter_access
from app.services.errors import Conflict, Forbidden, InvalidInput, NotFound
from app.services.resources import slugify


CHAPTER_NOT_FOUND = NotFound(
    "chapter_not_found",
    "Chapter not found.",
)

CHAPTER_EXISTS = Conflict(
    "chapter_exists",
    "A Chapter with this slug already exists.",
)

PROFILE_NOT_FOUND = NotFound(
    "profile_not_found",
    "Create a profile first.",
)

_NULLABLE_FIELDS = {
    "description",
    "city",
    "language_code",
    "contact_email",
}


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _role(db: Session, user_id: UserId) -> AccountRole | None:
    return db.scalar(
        select(User.account_role).where(User.id == user_id)
    )


def _require_admin(db: Session, user_id: UserId) -> None:
    if _role(db, user_id) != AccountRole.ADMIN:
        raise Forbidden(
            "admin_only",
            "Only platform Admins can manage Chapters.",
        )


def _is_platform_staff(db: Session, user_id: UserId) -> bool:
    return _role(db, user_id) in {
        AccountRole.ADMIN,
        AccountRole.MODERATOR,
    }


def _get_chapter(db: Session, chapter_id: uuid.UUID) -> Chapter:
    chapter = db.get(Chapter, chapter_id)

    if chapter is None:
        raise CHAPTER_NOT_FOUND

    return chapter


def _member_count(
    db: Session,
    chapter_ids: list[uuid.UUID],
) -> dict[uuid.UUID, int]:
    if not chapter_ids:
        return {}

    rows = db.execute(
        select(
            UserProfile.chapter_id,
            func.count(User.id),
        )
        .join(User, User.id == UserProfile.user_id)
        .where(
            UserProfile.chapter_id.in_(chapter_ids),
            User.membership_status == MembershipStatus.MEMBER,
        )
        .group_by(UserProfile.chapter_id)
    )

    return dict(rows.all())


def _my_chapter(
    db: Session,
    user_id: UserId,
) -> uuid.UUID | None:
    return db.scalar(
        select(UserProfile.chapter_id)
        .join(User, User.id == UserProfile.user_id)
        .where(
            UserProfile.user_id == user_id,
            User.membership_status == MembershipStatus.MEMBER,
        )
    )


def _serialize(
    db: Session,
    user_id: UserId,
    chapters: list[Chapter],
) -> list[ChapterRead]:
    chapter_ids = [chapter.id for chapter in chapters]

    member_counts = _member_count(db, chapter_ids)
    my_chapter_id = _my_chapter(db, user_id)
    staff_roles = (
        dict(
            db.execute(
                select(ChapterStaff.chapter_id, ChapterStaff.role).where(
                    ChapterStaff.user_id == user_id,
                    ChapterStaff.chapter_id.in_(chapter_ids),
                )
            ).all()
        )
        if chapter_ids
        else {}
    )
    platform_role = chapter_access.account_role(db, user_id)

    def my_role(chapter_id: uuid.UUID) -> str | None:
        if platform_role == AccountRole.ADMIN:
            return chapter_access.ChapterRole.PLATFORM_ADMIN.value
        if platform_role == AccountRole.MODERATOR:
            return chapter_access.ChapterRole.PLATFORM_MODERATOR.value
        if chapter_id in staff_roles:
            return staff_roles[chapter_id]
        if chapter_id == my_chapter_id:
            return chapter_access.ChapterRole.MEMBER.value
        return None

    return [
        ChapterRead(
            id=chapter.id,
            slug=chapter.slug,
            name=chapter.name,
            description=chapter.description,
            country_code=chapter.country_code,
            city=chapter.city,
            timezone=chapter.timezone,
            language_code=chapter.language_code,
            contact_email=chapter.contact_email,
            contact_phone=chapter.contact_phone,
            state=chapter.state,
            venue=chapter.venue,
            address=chapter.address,
            meeting_schedule=chapter.meeting_schedule,
            meeting_time=chapter.meeting_time,
            latitude=chapter.latitude,
            longitude=chapter.longitude,
            is_active=chapter.is_active,
            member_count=member_counts.get(chapter.id, 0),
            is_mine=chapter.id == my_chapter_id,
            my_role=my_role(chapter.id),
            created_at=chapter.created_at,
            updated_at=chapter.updated_at,
        )
        for chapter in chapters
    ]


def list_chapters(
    db: Session,
    user_id: UserId,
    *,
    q: str | None = None,
    country_code: str | None = None,
    include_archived: bool = False,
) -> list[ChapterRead]:
    statement = select(Chapter)

    if include_archived:
        if not _is_platform_staff(db, user_id):
            raise Forbidden(
                "insufficient_role",
                "Only platform Moderators and Admins can view archived Chapters.",
            )
    else:
        statement = statement.where(Chapter.is_active.is_(True))

    if country_code:
        statement = statement.where(
            Chapter.country_code == country_code.upper()
        )

    if q:
        pattern = f"%{_escape_like(q)}%"

        statement = statement.where(
            or_(
                Chapter.name.ilike(pattern, escape="\\"),
                Chapter.city.ilike(pattern, escape="\\"),
            )
        )

    statement = statement.order_by(
        Chapter.country_code,
        Chapter.name,
        Chapter.id,
    )

    chapters = list(db.scalars(statement))

    return _serialize(db, user_id, chapters)


def get_chapter(
    db: Session,
    user_id: UserId,
    chapter_id: uuid.UUID,
) -> ChapterRead:
    chapter = _get_chapter(db, chapter_id)

    return _serialize(db, user_id, [chapter])[0]


def _check_slug_free(
    db: Session,
    slug: str,
    chapter_id: uuid.UUID | None = None,
) -> None:
    existing_id = db.scalar(
        select(Chapter.id).where(Chapter.slug == slug)
    )

    if existing_id is not None and existing_id != chapter_id:
        raise CHAPTER_EXISTS


def _commit(
    db: Session,
    user_id: UserId,
    chapter: Chapter,
) -> ChapterRead:
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise CHAPTER_EXISTS from None

    db.refresh(chapter)

    return get_chapter(db, user_id, chapter.id)


def create_chapter(
    db: Session,
    user_id: UserId,
    data: ChapterCreate,
) -> ChapterRead:
    _require_admin(db, user_id)

    slug = data.slug or slugify(data.name)

    if len(slug) < 2:
        raise InvalidInput(
            "slug_required",
            "A valid Chapter slug is required.",
        )

    _check_slug_free(db, slug)

    fields = data.model_dump(exclude={"slug"})

    for field in _NULLABLE_FIELDS:
        fields[field] = fields.get(field) or None

    chapter = Chapter(
        id=uuid.uuid4(),
        slug=slug,
        **fields,
    )

    db.add(chapter)

    audit.record(
        db,
        user_id,
        "chapter.created",
        "chapter",
        chapter.id,
        data={
            "name": data.name,
            "slug": slug,
        },
    )

    return _commit(db, user_id, chapter)


def update_chapter(
    db: Session,
    user_id: UserId,
    chapter_id: uuid.UUID,
    data: ChapterUpdate,
) -> ChapterRead:
    _require_admin(db, user_id)

    chapter = _get_chapter(db, chapter_id)

    changes = data.model_dump(exclude_unset=True)

    for field in list(changes):
        if field in _NULLABLE_FIELDS:
            changes[field] = changes[field] or None
        elif changes[field] is None:
            changes.pop(field)

    if "slug" in changes:
        _check_slug_free(
            db,
            changes["slug"],
            chapter.id,
        )

    for field, value in changes.items():
        setattr(chapter, field, value)

    if changes:
        audit.record(
            db,
            user_id,
            "chapter.updated",
            "chapter",
            chapter.id,
            data={
                "changed": sorted(changes),
            },
        )

    return _commit(db, user_id, chapter)


def set_chapter_archived(
    db: Session,
    user_id: UserId,
    chapter_id: uuid.UUID,
    archived: bool,
) -> ChapterRead:
    _require_admin(db, user_id)

    chapter = _get_chapter(db, chapter_id)

    if chapter.is_active == archived:
        chapter.is_active = not archived

        audit.record(
            db,
            user_id,
            "chapter.archived" if archived else "chapter.restored",
            "chapter",
            chapter.id,
            data={
                "name": chapter.name,
            },
        )

    return _commit(db, user_id, chapter)


def chapter_leaders(db: Session, chapter_id: uuid.UUID) -> list[ChapterLeader]:
    """The Chapter's Coordinator(s), by display name. Public."""
    chapter = _get_chapter(db, chapter_id)
    if not chapter.is_active:
        raise CHAPTER_NOT_FOUND
    rows = db.execute(
        select(ChapterStaff.user_id, ChapterStaff.role, UserProfile.display_name)
        .join(UserProfile, UserProfile.user_id == ChapterStaff.user_id, isouter=True)
        .where(ChapterStaff.chapter_id == chapter_id)
        .order_by(ChapterStaff.created_at)
    ).all()
    return [
        ChapterLeader(
            user_id=user_id,
            display_name=name or "CYC leader",
            role="Chapter coordinator" if role == "coordinator" else role.title(),
        )
        for user_id, role, name in rows
    ]
