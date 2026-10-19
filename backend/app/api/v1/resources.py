"""Spiritual resource library endpoints: categories, resources, files,
bookmarks and reading progress."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_id
from app.core.identity import UserId
from app.db.session import get_db
from app.models.resource import ResourceKind
from app.schemas.common import Page
from app.schemas.locale import normalize_language_tag
from app.schemas.resource import (
    BookmarkRead,
    CategoryCreate,
    CategoryRead,
    CategoryUpdate,
    FileConfirmRequest,
    FileUploadIntent,
    FileUploadRequest,
    ProgressRead,
    ProgressUpdate,
    ResourceCreate,
    ResourceRead,
    ResourceSummary,
    ResourceUpdate,
)
from app.services import resources
from app.services.errors import InvalidInput
from app.services.object_storage import ObjectStorage, get_object_storage
from app.services.pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE

router = APIRouter(prefix="/resources", tags=["Resources"])
categories_router = APIRouter(prefix="/resource-categories", tags=["Resources"])

CurrentUserId = Annotated[UserId, Depends(get_current_user_id)]
DbSession = Annotated[Session, Depends(get_db)]
Storage = Annotated[ObjectStorage, Depends(get_object_storage)]
Limit = Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)]
Cursor = Annotated[str | None, Query(max_length=200)]


# Categories


@categories_router.get("", response_model=list[CategoryRead])
def list_categories(user_id: CurrentUserId, db: DbSession):
    """Every category, in display order."""
    return resources.list_categories(db)


@categories_router.post("", response_model=CategoryRead, status_code=status.HTTP_201_CREATED)
def create_category(data: CategoryCreate, user_id: CurrentUserId, db: DbSession):
    return resources.create_category(db, user_id, data)


@categories_router.patch("/{category_id}", response_model=CategoryRead)
def update_category(
    category_id: UUID, data: CategoryUpdate, user_id: CurrentUserId, db: DbSession
):
    return resources.update_category(db, user_id, category_id, data)


@categories_router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: UUID, user_id: CurrentUserId, db: DbSession):
    """Its resources stay, without a category."""
    resources.delete_category(db, user_id, category_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# Resources


@router.post("", response_model=ResourceRead, status_code=status.HTTP_201_CREATED)
def create_resource(data: ResourceCreate, user_id: CurrentUserId, db: DbSession):
    """Add a draft. Publish it when it's ready."""
    return resources.create_resource(db, user_id, data)


@router.get("", response_model=Page[ResourceSummary])
def list_resources(
    user_id: CurrentUserId,
    db: DbSession,
    limit: Limit = DEFAULT_PAGE_SIZE,
    cursor: Cursor = None,
    community_id: UUID | None = None,
    category_id: UUID | None = None,
    kind: ResourceKind | None = None,
    language: Annotated[str | None, Query(max_length=35)] = None,
    q: Annotated[str | None, Query(min_length=2, max_length=100)] = None,
    drafts: bool = False,
):
    """The library, newest first.

    Filter by ``community_id``, ``category_id``, ``kind`` or ``language``
    (``en`` also matches ``en-GB``), or search with ``q``. ``drafts=true``
    lists the drafts you manage instead.
    """
    if language:
        try:
            language = normalize_language_tag(language.strip())
        except ValueError as error:
            raise InvalidInput("invalid_language", str(error)) from None
    items, next_cursor = resources.list_resources(
        db,
        user_id,
        limit,
        cursor,
        community_id=community_id,
        category_id=category_id,
        kind=kind,
        language=language,
        q=q.strip() if q else None,
        drafts=drafts,
    )
    return Page(items=items, next_cursor=next_cursor)


@router.get("/bookmarks", response_model=Page[ResourceSummary])
def list_bookmarks(
    user_id: CurrentUserId,
    db: DbSession,
    limit: Limit = DEFAULT_PAGE_SIZE,
    cursor: Cursor = None,
):
    """Your bookmarks, most recently bookmarked first."""
    items, next_cursor = resources.list_bookmarks(db, user_id, limit, cursor)
    return Page(items=items, next_cursor=next_cursor)


@router.get("/in-progress", response_model=Page[ResourceSummary])
def list_in_progress(
    user_id: CurrentUserId,
    db: DbSession,
    limit: Limit = DEFAULT_PAGE_SIZE,
    cursor: Cursor = None,
):
    """What you started and haven't finished, most recently opened first."""
    items, next_cursor = resources.list_in_progress(db, user_id, limit, cursor)
    return Page(items=items, next_cursor=next_cursor)


@router.get("/{resource_id}", response_model=ResourceRead)
def get_resource(resource_id: UUID, user_id: CurrentUserId, db: DbSession, storage: Storage):
    """Includes the article body and a short-lived ``file_url``."""
    return resources.get_resource(db, user_id, resource_id, storage)


@router.patch("/{resource_id}", response_model=ResourceRead)
def update_resource(
    resource_id: UUID, data: ResourceUpdate, user_id: CurrentUserId, db: DbSession
):
    return resources.update_resource(db, user_id, resource_id, data)


@router.delete("/{resource_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_resource(
    resource_id: UUID, user_id: CurrentUserId, db: DbSession, storage: Storage
):
    """Deletes the uploaded file, bookmarks and progress too."""
    resources.delete_resource(db, user_id, resource_id, storage)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{resource_id}/publish", response_model=ResourceRead)
def publish_resource(resource_id: UUID, user_id: CurrentUserId, db: DbSession):
    return resources.publish_resource(db, user_id, resource_id)


@router.post("/{resource_id}/unpublish", response_model=ResourceRead)
def unpublish_resource(resource_id: UUID, user_id: CurrentUserId, db: DbSession):
    return resources.unpublish_resource(db, user_id, resource_id)


# Files


@router.post("/{resource_id}/file/upload-intent", response_model=FileUploadIntent)
def create_upload_intent(
    resource_id: UUID,
    data: FileUploadRequest,
    user_id: CurrentUserId,
    db: DbSession,
    storage: Storage,
):
    """Get a link to upload the audio, video or document file to, then
    confirm it with ``/file/confirm``."""
    return resources.create_upload_intent(db, user_id, resource_id, data.content_type, storage)


@router.post("/{resource_id}/file/confirm", response_model=ResourceRead)
def confirm_upload(
    resource_id: UUID,
    data: FileConfirmRequest,
    user_id: CurrentUserId,
    db: DbSession,
    storage: Storage,
):
    return resources.confirm_upload(db, user_id, resource_id, data.object_key, storage)


@router.delete("/{resource_id}/file", response_model=ResourceRead)
def remove_file(resource_id: UUID, user_id: CurrentUserId, db: DbSession, storage: Storage):
    return resources.remove_file(db, user_id, resource_id, storage)


# Bookmarks and progress


@router.put("/{resource_id}/bookmark", response_model=BookmarkRead)
def add_bookmark(resource_id: UUID, user_id: CurrentUserId, db: DbSession):
    return resources.add_bookmark(db, user_id, resource_id)


@router.delete("/{resource_id}/bookmark", status_code=status.HTTP_204_NO_CONTENT)
def remove_bookmark(resource_id: UUID, user_id: CurrentUserId, db: DbSession):
    resources.remove_bookmark(db, user_id, resource_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{resource_id}/progress", response_model=ProgressRead)
def get_progress(resource_id: UUID, user_id: CurrentUserId, db: DbSession):
    return resources.get_progress(db, user_id, resource_id)


@router.put("/{resource_id}/progress", response_model=ProgressRead)
def save_progress(
    resource_id: UUID, data: ProgressUpdate, user_id: CurrentUserId, db: DbSession
):
    """Save how far you got: ``percent`` and, for audio and video,
    ``position_seconds`` to resume from."""
    return resources.save_progress(db, user_id, resource_id, data)


@router.delete("/{resource_id}/progress", status_code=status.HTTP_204_NO_CONTENT)
def reset_progress(resource_id: UUID, user_id: CurrentUserId, db: DbSession):
    """Start over."""
    resources.reset_progress(db, user_id, resource_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
