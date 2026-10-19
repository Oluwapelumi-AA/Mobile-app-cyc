"""Search endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_id
from app.core.identity import UserId
from app.db.session import get_db
from app.schemas.common import Page
from app.schemas.search import SearchHit, SearchOverview, SearchType
from app.services import search
from app.services.pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE

router = APIRouter(prefix="/search", tags=["Search"])

CurrentUserId = Annotated[UserId, Depends(get_current_user_id)]
DbSession = Annotated[Session, Depends(get_db)]
Cursor = Annotated[str | None, Query(max_length=200)]
SearchQuery = Annotated[str, Query(min_length=2, max_length=100)]


def _clean(q: str) -> str:
    return " ".join(q.split())


@router.get("", response_model=SearchOverview)
def search_all(
    q: SearchQuery,
    user_id: CurrentUserId,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=10)] = search.OVERVIEW_LIMIT,
):
    """The first few matches of every type."""
    return search.search_all(db, user_id, _clean(q), limit)


@router.get("/{search_type}", response_model=Page[SearchHit])
def search_type(
    search_type: SearchType,
    q: SearchQuery,
    user_id: CurrentUserId,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
    cursor: Cursor = None,
):
    """Page through one type's matches, newest first."""
    items, next_cursor = search.search_type(db, user_id, search_type, _clean(q), limit, cursor)
    return Page(items=items, next_cursor=next_cursor)
