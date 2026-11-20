
"""Chapter directory and administration endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_id, get_viewer_id
from app.core.identity import UserId
from app.db.session import get_db
from app.schemas.chapter import ChapterCreate, ChapterLeader, ChapterRead, ChapterUpdate
from app.services import chapters as service


router = APIRouter(
    prefix="/chapters",
    tags=["Chapters"],
)

CurrentUserId = Annotated[
    UserId,
    Depends(get_current_user_id),
]
ViewerId = Annotated[UserId, Depends(get_viewer_id)]

DbSession = Annotated[
    Session,
    Depends(get_db),
]


@router.get("", response_model=list[ChapterRead])
def list_chapters(
    user_id: ViewerId,
    db: DbSession,
    q: Annotated[str | None, Query(max_length=100)] = None,
    country_code: Annotated[
        str | None,
        Query(min_length=2, max_length=2),
    ] = None,
    include_archived: bool = False,
):
    return service.list_chapters(
        db,
        user_id,
        q=q,
        country_code=country_code,
        include_archived=include_archived,
    )


@router.post(
    "",
    response_model=ChapterRead,
    status_code=status.HTTP_201_CREATED,
)
def create_chapter(
    data: ChapterCreate,
    user_id: CurrentUserId,
    db: DbSession,
):
    return service.create_chapter(db, user_id, data)


@router.get("/{chapter_id}", response_model=ChapterRead)
def get_chapter(
    chapter_id: UUID,
    user_id: ViewerId,
    db: DbSession,
):
    return service.get_chapter(db, user_id, chapter_id)


@router.patch("/{chapter_id}", response_model=ChapterRead)
def update_chapter(
    chapter_id: UUID,
    data: ChapterUpdate,
    user_id: CurrentUserId,
    db: DbSession,
):
    return service.update_chapter(
        db,
        user_id,
        chapter_id,
        data,
    )


@router.post(
    "/{chapter_id}/archive",
    response_model=ChapterRead,
)
def archive_chapter(
    chapter_id: UUID,
    user_id: CurrentUserId,
    db: DbSession,
):
    return service.set_chapter_archived(
        db,
        user_id,
        chapter_id,
        archived=True,
    )


@router.post(
    "/{chapter_id}/restore",
    response_model=ChapterRead,
)
def restore_chapter(
    chapter_id: UUID,
    user_id: CurrentUserId,
    db: DbSession,
):
    return service.set_chapter_archived(
        db,
        user_id,
        chapter_id,
        archived=False,
    )


@router.get("/{chapter_id}/leaders", response_model=list[ChapterLeader])
def chapter_leaders(chapter_id: UUID, user_id: ViewerId, db: DbSession):
    """Who leads the Chapter: names and roles only. Anyone can see this,
    so people can get to know a Chapter before joining."""
    return service.chapter_leaders(db, chapter_id)
