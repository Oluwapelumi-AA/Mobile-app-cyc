"""The spiritual resource library: categories, resources, bookmarks and
reading progress.

- Categories (Devotionals, Bible Study, Sermons, ...) are shared by the whole
  app and managed by app moderators and admins (``users.account_role``).
- A resource is an ``article`` (text read in the app), ``audio``, ``video``,
  ``document`` (PDF or EPUB) or ``link``. It belongs to a community or to the
  app-wide library. Community moderators and above manage their community's
  resources; app moderators and admins manage every resource and are the
  only ones who add to the app-wide library.
- Resources start as drafts, seen only by the people who manage them. A
  published resource is seen by anyone who can see its community (everyone
  for the app-wide library), like events. Hidden ones answer 404.
- Publishing needs content: a body for an article, a link for a link, and an
  uploaded file or a link for audio, video and documents.
- Files never pass through the API: managers upload straight to object
  storage with a presigned link, then confirm. Readers get a short-lived
  download link when they open the resource.
- Every user keeps their own bookmarks and progress (percent read or
  watched, and where to resume audio and video) on published resources.
"""

import re
import unicodedata
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.identity import UserId
from app.models.community import (
    Community,
    CommunityMembership,
    CommunityRole,
    CommunityVisibility,
)
from app.models.resource import (
    Resource,
    ResourceBookmark,
    ResourceCategory,
    ResourceKind,
    ResourceProgress,
    ResourceStatus,
)
from app.schemas.resource import (
    FILE_CONTENT_TYPES,
    BookmarkRead,
    CategoryCreate,
    CategoryRead,
    CategoryUpdate,
    FileUploadIntent,
    ProgressRead,
    ProgressUpdate,
    ResourceCreate,
    ResourceRead,
    ResourceSummary,
    ResourceUpdate,
)
from app.services import notifications, pagination
from app.services.communities import (
    get_visible_community,
    is_platform_moderator,
    rank,
    require_role,
)
from app.services.errors import (
    Conflict,
    Forbidden,
    InvalidInput,
    NotFound,
    ServiceUnavailable,
)
from app.services.object_storage import ObjectStorage, StorageUnavailable

RESOURCE_NOT_FOUND = NotFound("resource_not_found", "Resource not found.")
CATEGORY_NOT_FOUND = NotFound("category_not_found", "Category not found.")
CATEGORY_EXISTS = Conflict("category_exists", "A category with that slug already exists.")
NOT_PUBLISHED = Conflict("resource_not_published", "This resource hasn't been published yet.")
STORAGE_UNAVAILABLE = ServiceUnavailable(
    "storage_unavailable", "File storage is not available right now."
)

PUBLISHED = ResourceStatus.PUBLISHED.value
DRAFT = ResourceStatus.DRAFT.value

_FILE_EXTENSIONS = {
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "application/pdf": "pdf",
    "application/epub+zip": "epub",
}


def _now() -> datetime:
    return datetime.now(UTC)


# Categories


def _require_platform_moderator(db: Session, user_id: UserId) -> None:
    if not is_platform_moderator(db, user_id):
        raise Forbidden(
            "insufficient_role", "Only app moderators and admins manage categories."
        )


def slugify(name: str) -> str:
    """``"Bible Study & Prayer"`` -> ``"bible-study-prayer"``; accents dropped."""
    ascii_name = (
        unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    )
    return re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")[:80].strip("-")


def _commit_category(db: Session, category: ResourceCategory) -> CategoryRead:
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise CATEGORY_EXISTS from None
    db.refresh(category)
    return CategoryRead.model_validate(category)


def _check_slug_free(db: Session, slug: str, category_id: uuid.UUID | None = None) -> None:
    existing = db.scalar(select(ResourceCategory.id).where(ResourceCategory.slug == slug))
    if existing is not None and existing != category_id:
        raise CATEGORY_EXISTS


def list_categories(db: Session) -> list[CategoryRead]:
    rows = db.scalars(
        select(ResourceCategory).order_by(
            ResourceCategory.sort_order, ResourceCategory.name, ResourceCategory.id
        )
    )
    return [CategoryRead.model_validate(row) for row in rows]


def create_category(db: Session, user_id: UserId, data: CategoryCreate) -> CategoryRead:
    _require_platform_moderator(db, user_id)
    slug = data.slug or slugify(data.name)
    if len(slug) < 2:
        raise InvalidInput(
            "slug_required", "Send a slug made of letters, numbers and dashes."
        )
    _check_slug_free(db, slug)
    category = ResourceCategory(
        slug=slug,
        name=data.name,
        description=data.description or None,
        sort_order=data.sort_order,
    )
    db.add(category)
    return _commit_category(db, category)


def update_category(
    db: Session, user_id: UserId, category_id: uuid.UUID, data: CategoryUpdate
) -> CategoryRead:
    _require_platform_moderator(db, user_id)
    category = db.get(ResourceCategory, category_id)
    if category is None:
        raise CATEGORY_NOT_FOUND
    changes = data.model_dump(exclude_unset=True)
    for required in ("name", "slug", "sort_order"):
        if changes.get(required) is None:
            changes.pop(required, None)
    if "slug" in changes:
        _check_slug_free(db, changes["slug"], category.id)
    for name, value in changes.items():
        setattr(category, name, value or None if name == "description" else value)
    return _commit_category(db, category)


def delete_category(db: Session, user_id: UserId, category_id: uuid.UUID) -> None:
    """Its resources stay in the library without a category."""
    _require_platform_moderator(db, user_id)
    category = db.get(ResourceCategory, category_id)
    if category is None:
        raise CATEGORY_NOT_FOUND
    db.execute(
        Resource.__table__.update()
        .where(Resource.category_id == category.id)
        .values(category_id=None)
    )
    db.delete(category)
    db.commit()


def _check_category(db: Session, category_id: uuid.UUID | None) -> None:
    if category_id is not None and db.get(ResourceCategory, category_id) is None:
        raise CATEGORY_NOT_FOUND


# Access


def _can_manage(
    community_id: uuid.UUID | None, membership_role: str | None, platform_moderator: bool
) -> bool:
    if platform_moderator:
        return True
    return community_id is not None and rank(membership_role) >= rank(CommunityRole.MODERATOR)


def _visible_resource(
    db: Session, user_id: UserId, resource_id: uuid.UUID
) -> tuple[Resource, CommunityMembership | None, bool]:
    """Load a resource the user may see, their membership and whether they
    manage it. Drafts are hidden from everyone else."""
    resource = db.get(Resource, resource_id)
    if resource is None:
        raise RESOURCE_NOT_FOUND
    membership = None
    if resource.community_id is not None:
        try:
            _, membership = get_visible_community(db, resource.community_id, user_id)
        except NotFound:
            raise RESOURCE_NOT_FOUND from None
    can_manage = _can_manage(
        resource.community_id,
        membership.role if membership else None,
        is_platform_moderator(db, user_id),
    )
    if resource.status != PUBLISHED and not can_manage:
        raise RESOURCE_NOT_FOUND
    return resource, membership, can_manage


def visible_resource(db: Session, user_id: UserId, resource_id: uuid.UUID) -> Resource:
    """The resource, or 404 if the user can't see it."""
    return _visible_resource(db, user_id, resource_id)[0]


def published_and_visible(user_id: UserId):
    """WHERE clause for published resources the user can see."""
    return _published_and_visible(user_id)


def _managed_resource(
    db: Session, user_id: UserId, resource_id: uuid.UUID
) -> Resource:
    resource, membership, can_manage = _visible_resource(db, user_id, resource_id)
    if not can_manage:
        if resource.community_id is None:
            raise Forbidden(
                "insufficient_role",
                "Only app moderators and admins manage the app-wide library.",
            )
        require_role(membership, CommunityRole.MODERATOR)
    return resource


def _published_resource(db: Session, user_id: UserId, resource_id: uuid.UUID) -> Resource:
    resource, *_ = _visible_resource(db, user_id, resource_id)
    if resource.status != PUBLISHED:
        raise NOT_PUBLISHED
    return resource


def _published_and_visible(user_id: UserId):
    """WHERE clause for published resources the user can see."""
    my_communities = select(CommunityMembership.community_id).where(
        CommunityMembership.user_id == user_id
    )
    public_communities = select(Community.id).where(
        Community.visibility == CommunityVisibility.PUBLIC.value
    )
    return (Resource.status == PUBLISHED) & or_(
        Resource.community_id.is_(None),
        Resource.community_id.in_(public_communities),
        Resource.community_id.in_(my_communities),
    )


# Reading


def _progress_read(progress: ResourceProgress) -> ProgressRead:
    return ProgressRead.model_validate(
        {
            "resource_id": progress.resource_id,
            "percent": progress.percent,
            "position_seconds": progress.position_seconds,
            "completed": progress.completed_at is not None,
            "completed_at": progress.completed_at,
            "updated_at": progress.updated_at,
        }
    )


def _summary_fields(
    resource: Resource,
    bookmarked: bool,
    progress: ResourceProgress | None,
    can_manage: bool,
) -> dict:
    return {
        "id": resource.id,
        "community_id": resource.community_id,
        "category_id": resource.category_id,
        "created_by": resource.created_by,
        "kind": resource.kind,
        "status": resource.status,
        "title": resource.title,
        "summary": resource.summary,
        "author_name": resource.author_name,
        "scripture_reference": resource.scripture_reference,
        "language": resource.language,
        "external_url": resource.external_url,
        "has_file": resource.file_key is not None,
        "file_content_type": resource.file_content_type,
        "file_size_bytes": resource.file_size_bytes,
        "duration_seconds": resource.duration_seconds,
        "published_at": resource.published_at,
        "bookmarked": bookmarked,
        "my_progress": _progress_read(progress) if progress else None,
        "can_manage": can_manage,
        "created_at": resource.created_at,
        "updated_at": resource.updated_at,
    }


def _get_bookmark(
    db: Session, user_id: UserId, resource_id: uuid.UUID
) -> ResourceBookmark | None:
    return db.scalar(
        select(ResourceBookmark).where(
            ResourceBookmark.user_id == user_id,
            ResourceBookmark.resource_id == resource_id,
        )
    )


def _get_progress(
    db: Session, user_id: UserId, resource_id: uuid.UUID
) -> ResourceProgress | None:
    return db.scalar(
        select(ResourceProgress).where(
            ResourceProgress.user_id == user_id,
            ResourceProgress.resource_id == resource_id,
        )
    )


def _resource_read(
    db: Session,
    user_id: UserId,
    resource: Resource,
    can_manage: bool,
    storage: ObjectStorage | None = None,
) -> ResourceRead:
    file_url = expires_at = None
    if storage is not None and resource.file_key:
        expires_in = settings.storage_presign_ttl_seconds
        try:
            file_url = storage.presign_download(resource.file_key, expires_in)
            expires_at = _now() + timedelta(seconds=expires_in)
        except StorageUnavailable:
            # The rest of the resource is still worth showing.
            pass
    return ResourceRead.model_validate(
        {
            **_summary_fields(
                resource,
                _get_bookmark(db, user_id, resource.id) is not None,
                _get_progress(db, user_id, resource.id),
                can_manage,
            ),
            "body": resource.body,
            "file_url": file_url,
            "file_url_expires_at": expires_at,
        }
    )


def _summaries(db: Session, user_id: UserId, rows: list[Resource]) -> list[ResourceSummary]:
    """Summaries for a page of resources, with the user's own state."""
    ids = [row.id for row in rows]
    if not ids:
        return []
    bookmarked = set(
        db.scalars(
            select(ResourceBookmark.resource_id).where(
                ResourceBookmark.user_id == user_id,
                ResourceBookmark.resource_id.in_(ids),
            )
        )
    )
    progress = {
        row.resource_id: row
        for row in db.scalars(
            select(ResourceProgress).where(
                ResourceProgress.user_id == user_id,
                ResourceProgress.resource_id.in_(ids),
            )
        )
    }
    community_ids = {row.community_id for row in rows if row.community_id is not None}
    my_roles = (
        dict(
            db.execute(
                select(CommunityMembership.community_id, CommunityMembership.role).where(
                    CommunityMembership.user_id == user_id,
                    CommunityMembership.community_id.in_(community_ids),
                )
            ).all()
        )
        if community_ids
        else {}
    )
    platform_moderator = is_platform_moderator(db, user_id)
    return [
        ResourceSummary.model_validate(
            _summary_fields(
                row,
                row.id in bookmarked,
                progress.get(row.id),
                _can_manage(row.community_id, my_roles.get(row.community_id), platform_moderator),
            )
        )
        for row in rows
    ]


def get_resource(
    db: Session, user_id: UserId, resource_id: uuid.UUID, storage: ObjectStorage
) -> ResourceRead:
    resource, _, can_manage = _visible_resource(db, user_id, resource_id)
    return _resource_read(db, user_id, resource, can_manage, storage)


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def list_resources(
    db: Session,
    user_id: UserId,
    limit: int,
    cursor: str | None,
    *,
    community_id: uuid.UUID | None = None,
    category_id: uuid.UUID | None = None,
    kind: ResourceKind | None = None,
    language: str | None = None,
    q: str | None = None,
    drafts: bool = False,
) -> tuple[list[ResourceSummary], str | None]:
    """Published resources the user can see, newest published first.

    With ``drafts``, the drafts the user manages instead, newest first.
    ``language=en`` also matches ``en-GB`` and ``en-NG``. ``q`` searches the
    title, summary, author and scripture reference.
    """
    statement = select(Resource)
    if community_id is not None:
        _, membership = get_visible_community(db, community_id, user_id)
        statement = statement.where(Resource.community_id == community_id)
    if drafts:
        statement = statement.where(Resource.status == DRAFT)
        if not is_platform_moderator(db, user_id):
            if community_id is not None:
                require_role(membership, CommunityRole.MODERATOR)
            else:
                managed = select(CommunityMembership.community_id).where(
                    CommunityMembership.user_id == user_id,
                    CommunityMembership.role.in_(
                        [
                            role.value
                            for role in CommunityRole
                            if rank(role) >= rank(CommunityRole.MODERATOR)
                        ]
                    ),
                )
                statement = statement.where(Resource.community_id.in_(managed))
        sort_column, sort_attr = Resource.created_at, "created_at"
    else:
        statement = statement.where(_published_and_visible(user_id))
        sort_column, sort_attr = Resource.published_at, "published_at"

    if category_id is not None:
        statement = statement.where(Resource.category_id == category_id)
    if kind is not None:
        statement = statement.where(Resource.kind == kind.value)
    if language:
        statement = statement.where(
            or_(
                Resource.language == language,
                Resource.language.like(f"{_escape_like(language)}-%", escape="\\"),
            )
        )
    if q:
        pattern = f"%{_escape_like(q)}%"
        statement = statement.where(
            or_(
                *(
                    column.ilike(pattern, escape="\\")
                    for column in (
                        Resource.title,
                        Resource.summary,
                        Resource.author_name,
                        Resource.scripture_reference,
                    )
                )
            )
        )
    if cursor:
        statement = statement.where(
            pagination.after_cursor(sort_column, Resource.id, cursor, newest_first=True)
        )
    statement = statement.order_by(
        *pagination.order_by(sort_column, Resource.id, newest_first=True)
    ).limit(limit + 1)
    rows, next_cursor = pagination.split_page(
        list(db.scalars(statement)), limit, created_attr=sort_attr
    )
    return _summaries(db, user_id, rows), next_cursor


# Managing resources


def _missing_content(resource: Resource) -> str | None:
    """Why the resource can't be published yet, or None when it can."""
    if resource.kind == ResourceKind.ARTICLE.value and not resource.body:
        return "An article needs a body before it can be published."
    if resource.kind == ResourceKind.LINK.value and not resource.external_url:
        return "A link needs an external_url before it can be published."
    if (
        resource.kind in {kind.value for kind in FILE_CONTENT_TYPES}
        and not resource.file_key
        and not resource.external_url
    ):
        return "Upload a file or add an external_url before publishing."
    return None


def _require_complete(resource: Resource) -> None:
    reason = _missing_content(resource)
    if reason is not None:
        raise InvalidInput("resource_incomplete", reason)


def create_resource(db: Session, user_id: UserId, data: ResourceCreate) -> ResourceRead:
    if data.community_id is not None:
        _, membership = get_visible_community(db, data.community_id, user_id)
        if not is_platform_moderator(db, user_id):
            require_role(membership, CommunityRole.MODERATOR)
    elif not is_platform_moderator(db, user_id):
        raise Forbidden(
            "insufficient_role",
            "Only app moderators and admins add to the app-wide library.",
        )
    _check_category(db, data.category_id)

    resource = Resource(
        community_id=data.community_id,
        category_id=data.category_id,
        created_by=user_id,
        kind=data.kind.value,
        title=data.title,
        summary=data.summary or None,
        body=data.body or None,
        author_name=data.author_name or None,
        scripture_reference=data.scripture_reference or None,
        language=data.language,
        external_url=str(data.external_url) if data.external_url else None,
        duration_seconds=data.duration_seconds,
    )
    db.add(resource)
    db.commit()
    db.refresh(resource)
    return _resource_read(db, user_id, resource, True)


def update_resource(
    db: Session, user_id: UserId, resource_id: uuid.UUID, data: ResourceUpdate
) -> ResourceRead:
    resource = _managed_resource(db, user_id, resource_id)
    changes = data.model_dump(exclude_unset=True)
    for required in ("kind", "title"):
        if changes.get(required) is None:
            changes.pop(required, None)

    if "category_id" in changes:
        _check_category(db, changes["category_id"])
    if "kind" in changes and changes["kind"].value != resource.kind:
        if resource.file_key:
            raise Conflict(
                "file_attached", "Remove the uploaded file before changing the kind."
            )
        resource.kind = changes.pop("kind").value
    changes.pop("kind", None)
    if "external_url" in changes:
        url = changes.pop("external_url")
        resource.external_url = str(url) if url else None
    for name, value in changes.items():
        setattr(resource, name, value if value != "" else None)

    if resource.status == PUBLISHED:
        _require_complete(resource)
    db.commit()
    db.refresh(resource)
    return _resource_read(db, user_id, resource, True)


def publish_resource(db: Session, user_id: UserId, resource_id: uuid.UUID) -> ResourceRead:
    """Publish a draft. Publishing again is harmless."""
    resource = _managed_resource(db, user_id, resource_id)
    if resource.status != PUBLISHED:
        _require_complete(resource)
        resource.status = PUBLISHED
        # Keep the first publication date when a resource is republished.
        resource.published_at = resource.published_at or _now()
        notifications.resource_published(db, resource, user_id)
        db.commit()
        db.refresh(resource)
    return _resource_read(db, user_id, resource, True)


def unpublish_resource(db: Session, user_id: UserId, resource_id: uuid.UUID) -> ResourceRead:
    """Turn it back into a draft. Bookmarks and progress are kept."""
    resource = _managed_resource(db, user_id, resource_id)
    if resource.status != DRAFT:
        resource.status = DRAFT
        db.commit()
        db.refresh(resource)
    return _resource_read(db, user_id, resource, True)


def _delete_file(storage: ObjectStorage, key: str | None) -> None:
    if not key:
        return
    try:
        storage.delete(key)
    except StorageUnavailable:
        # Nothing to delete from when storage is off.
        pass


def delete_resource(
    db: Session, user_id: UserId, resource_id: uuid.UUID, storage: ObjectStorage
) -> None:
    resource = _managed_resource(db, user_id, resource_id)
    _delete_file(storage, resource.file_key)
    for model in (ResourceBookmark, ResourceProgress):
        db.execute(model.__table__.delete().where(model.resource_id == resource.id))
    db.delete(resource)
    db.commit()


# Files


def file_key_prefix(resource_id: uuid.UUID) -> str:
    return f"resources/{resource_id}/"


def _require_file_kind(resource: Resource) -> frozenset[str]:
    allowed = FILE_CONTENT_TYPES.get(ResourceKind(resource.kind))
    if allowed is None:
        raise Conflict(
            "file_not_allowed", f"A {resource.kind} resource can't have an uploaded file."
        )
    return allowed


def create_upload_intent(
    db: Session,
    user_id: UserId,
    resource_id: uuid.UUID,
    content_type: str,
    storage: ObjectStorage,
) -> FileUploadIntent:
    resource = _managed_resource(db, user_id, resource_id)
    allowed = _require_file_kind(resource)
    if content_type not in allowed:
        raise InvalidInput(
            "unsupported_file_type",
            f"A {resource.kind} resource takes {', '.join(sorted(allowed))}.",
        )
    key = f"{file_key_prefix(resource.id)}{uuid.uuid4().hex}.{_FILE_EXTENSIONS[content_type]}"
    try:
        upload = storage.presign_upload(key, content_type, settings.storage_presign_ttl_seconds)
    except StorageUnavailable:
        raise STORAGE_UNAVAILABLE from None
    return FileUploadIntent(
        upload_url=upload.url,
        method="PUT",
        headers=upload.headers,
        object_key=key,
        expires_at=upload.expires_at,
        max_size_bytes=settings.resource_max_upload_bytes,
    )


def confirm_upload(
    db: Session,
    user_id: UserId,
    resource_id: uuid.UUID,
    object_key: str,
    storage: ObjectStorage,
) -> ResourceRead:
    """Attach an uploaded file, replacing (and deleting) any earlier one."""
    resource = _managed_resource(db, user_id, resource_id)
    allowed = _require_file_kind(resource)
    invalid = InvalidInput("invalid_upload", "The uploaded file was not found.")
    if not object_key.startswith(file_key_prefix(resource.id)) or ".." in object_key:
        raise invalid
    try:
        stored = storage.head(object_key)
    except StorageUnavailable:
        raise STORAGE_UNAVAILABLE from None
    if stored is None:
        raise invalid
    if stored.content_type not in allowed:
        _delete_file(storage, object_key)
        raise InvalidInput(
            "unsupported_file_type",
            f"A {resource.kind} resource takes {', '.join(sorted(allowed))}.",
        )
    if stored.size_bytes > settings.resource_max_upload_bytes:
        _delete_file(storage, object_key)
        raise InvalidInput("file_too_large", "The file is too large.")

    if resource.file_key and resource.file_key != object_key:
        _delete_file(storage, resource.file_key)
    resource.file_key = object_key
    resource.file_content_type = stored.content_type
    resource.file_size_bytes = stored.size_bytes
    db.commit()
    db.refresh(resource)
    return _resource_read(db, user_id, resource, True, storage)


def remove_file(
    db: Session, user_id: UserId, resource_id: uuid.UUID, storage: ObjectStorage
) -> ResourceRead:
    resource = _managed_resource(db, user_id, resource_id)
    if resource.file_key is None:
        raise NotFound("file_not_found", "This resource has no uploaded file.")
    key = resource.file_key
    resource.file_key = resource.file_content_type = resource.file_size_bytes = None
    if resource.status == PUBLISHED and _missing_content(resource):
        db.rollback()
        raise Conflict(
            "resource_published",
            "This is the resource's only content. Add an external_url or "
            "unpublish it first.",
        )
    db.commit()
    _delete_file(storage, key)
    db.refresh(resource)
    return _resource_read(db, user_id, resource, True)


# Bookmarks


def _bookmark_read(bookmark: ResourceBookmark) -> BookmarkRead:
    return BookmarkRead(
        resource_id=bookmark.resource_id, bookmarked=True, created_at=bookmark.created_at
    )


def add_bookmark(db: Session, user_id: UserId, resource_id: uuid.UUID) -> BookmarkRead:
    """Bookmark a published resource. Bookmarking twice is harmless."""
    resource = _published_resource(db, user_id, resource_id)
    bookmark = _get_bookmark(db, user_id, resource.id)
    if bookmark is None:
        bookmark = ResourceBookmark(user_id=user_id, resource_id=resource.id)
        db.add(bookmark)
        try:
            db.commit()
        except IntegrityError:
            # A second tap raced this one; keep the first.
            db.rollback()
            bookmark = _get_bookmark(db, user_id, resource.id)
        else:
            db.refresh(bookmark)
    return _bookmark_read(bookmark)


def remove_bookmark(db: Session, user_id: UserId, resource_id: uuid.UUID) -> None:
    """Removing a bookmark that isn't there is harmless."""
    resource, *_ = _visible_resource(db, user_id, resource_id)
    db.execute(
        ResourceBookmark.__table__.delete().where(
            ResourceBookmark.user_id == user_id,
            ResourceBookmark.resource_id == resource.id,
        )
    )
    db.commit()


def list_bookmarks(
    db: Session, user_id: UserId, limit: int, cursor: str | None
) -> tuple[list[ResourceSummary], str | None]:
    """The user's bookmarked resources, most recently bookmarked first.

    Resources that were unpublished or are no longer visible are left out.
    """
    statement = (
        select(ResourceBookmark)
        .join(Resource, Resource.id == ResourceBookmark.resource_id)
        .where(ResourceBookmark.user_id == user_id, _published_and_visible(user_id))
    )
    if cursor:
        statement = statement.where(
            pagination.after_cursor(
                ResourceBookmark.created_at, ResourceBookmark.id, cursor, newest_first=True
            )
        )
    statement = statement.order_by(
        *pagination.order_by(ResourceBookmark.created_at, ResourceBookmark.id, newest_first=True)
    ).limit(limit + 1)
    bookmarks, next_cursor = pagination.split_page(list(db.scalars(statement)), limit)
    return _resources_in_order(db, user_id, [b.resource_id for b in bookmarks]), next_cursor


def _resources_in_order(
    db: Session, user_id: UserId, resource_ids: list[uuid.UUID]
) -> list[ResourceSummary]:
    if not resource_ids:
        return []
    by_id = {
        row.id: row
        for row in db.scalars(select(Resource).where(Resource.id.in_(resource_ids)))
    }
    return _summaries(db, user_id, [by_id[rid] for rid in resource_ids if rid in by_id])


# Progress


def get_progress(db: Session, user_id: UserId, resource_id: uuid.UUID) -> ProgressRead:
    resource, *_ = _visible_resource(db, user_id, resource_id)
    progress = _get_progress(db, user_id, resource.id)
    if progress is None:
        raise NotFound("no_progress", "You haven't started this resource.")
    return _progress_read(progress)


def save_progress(
    db: Session, user_id: UserId, resource_id: uuid.UUID, data: ProgressUpdate
) -> ProgressRead:
    """Record how far the user got. Reaching 100% marks it completed; that
    date is kept if they go through it again."""
    resource = _published_resource(db, user_id, resource_id)
    percent = 100 if data.completed else data.percent
    progress = _get_progress(db, user_id, resource.id)
    if progress is None:
        progress = ResourceProgress(user_id=user_id, resource_id=resource.id)
        db.add(progress)
    progress.percent = percent
    if "position_seconds" in data.model_fields_set:
        progress.position_seconds = data.position_seconds
    now = _now()
    if percent == 100 and progress.completed_at is None:
        progress.completed_at = now
    # Set every time, so "continue" lists stay in the order things were opened.
    progress.updated_at = now
    try:
        db.commit()
    except IntegrityError:
        # A first save raced another one from the same user; apply on top.
        db.rollback()
        return save_progress(db, user_id, resource_id, data)
    db.refresh(progress)
    return _progress_read(progress)


def reset_progress(db: Session, user_id: UserId, resource_id: uuid.UUID) -> None:
    resource, *_ = _visible_resource(db, user_id, resource_id)
    db.execute(
        ResourceProgress.__table__.delete().where(
            ResourceProgress.user_id == user_id,
            ResourceProgress.resource_id == resource.id,
        )
    )
    db.commit()


def list_in_progress(
    db: Session, user_id: UserId, limit: int, cursor: str | None
) -> tuple[list[ResourceSummary], str | None]:
    """Resources the user started and hasn't finished, most recently opened
    first ("continue where you left off")."""
    statement = (
        select(ResourceProgress)
        .join(Resource, Resource.id == ResourceProgress.resource_id)
        .where(
            ResourceProgress.user_id == user_id,
            ResourceProgress.percent < 100,
            _published_and_visible(user_id),
        )
    )
    if cursor:
        statement = statement.where(
            pagination.after_cursor(
                ResourceProgress.updated_at, ResourceProgress.id, cursor, newest_first=True
            )
        )
    statement = statement.order_by(
        *pagination.order_by(ResourceProgress.updated_at, ResourceProgress.id, newest_first=True)
    ).limit(limit + 1)
    rows, next_cursor = pagination.split_page(
        list(db.scalars(statement)), limit, created_attr="updated_at"
    )
    return _resources_in_order(db, user_id, [row.resource_id for row in rows]), next_cursor
