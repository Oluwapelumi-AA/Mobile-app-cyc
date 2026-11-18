"""Search across Chapters, people, posts, events and resources.

Only what the user could open anyway is found: active Chapters; active
people; posts in the user's own Chapter (or granted to them as a Guest);
upcoming (not cancelled) app-wide events and those of the user's Chapter;
and published resources they can see. Matching is a case-insensitive
"contains" on names, titles and text, newest first within each type.

This is plain ``LIKE`` matching. It is fine for a young app; on PostgreSQL,
``pg_trgm`` indexes or full-text search are the next step when tables grow.
"""

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import Select, or_, select
from sqlalchemy.orm import Session

from app.core.identity import UserId
from app.models.chapter import Chapter
from app.models.chapter_access_grant import ChapterAccessGrantItem
from app.models.event import Event, EventStatus
from app.models.post import Post
from app.models.resource import Resource
from app.models.user import User
from app.models.user_profile import UserProfile
from app.schemas.search import SearchHit, SearchOverview, SearchType
from app.services import chapter_access, pagination, resources

SNIPPET_LENGTH = 160
OVERVIEW_LIMIT = 5


def _now() -> datetime:
    return datetime.now(UTC)


def _pattern(q: str) -> str:
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _matches(pattern: str, *columns):
    return or_(*(column.ilike(pattern, escape="\\") for column in columns))


def _snippet(text: str | None) -> str | None:
    if not text:
        return None
    text = " ".join(text.split())
    if len(text) <= SNIPPET_LENGTH:
        return text
    return text[: SNIPPET_LENGTH - 1].rstrip() + "…"


def _chapter_scope(db: Session, user_id: UserId, chapter_column, id_column, grant_column):
    """WHERE clause: content of Chapters the user reads, or items granted."""
    active = chapter_access.active_chapter_ids()
    readable = chapter_access.readable_chapter_ids(db, user_id)
    if readable is None:
        return chapter_column.in_(active)
    granted = chapter_access.granted_ids(db, user_id, grant_column)
    return chapter_column.in_(active) & or_(
        chapter_column.in_(readable),
        id_column.in_(granted),
    )


# One query per type: (statement, created_at column, id column, row -> hit).


def _chapters(db: Session, user_id: UserId, pattern: str):
    statement = select(Chapter).where(
        Chapter.is_active.is_(True),
        _matches(pattern, Chapter.name, Chapter.city, Chapter.description),
    )
    return statement, Chapter.created_at, Chapter.id, lambda row: SearchHit(
        type=SearchType.CHAPTERS,
        id=row.id,
        title=row.name,
        snippet=_snippet(row.city or row.description),
        chapter_id=row.id,
        created_at=row.created_at,
    )


def _people(db: Session, user_id: UserId, pattern: str):
    statement = (
        select(UserProfile)
        .join(User, User.id == UserProfile.user_id)
        .where(User.is_active.is_(True), _matches(pattern, UserProfile.display_name))
    )
    return statement, UserProfile.created_at, UserProfile.user_id, lambda row: SearchHit(
        type=SearchType.PEOPLE,
        id=row.user_id,
        title=row.display_name,
        snippet=_snippet(row.bio),
        chapter_id=None,
        image_url=row.avatar_url,
        created_at=row.created_at,
    )


def _posts(db: Session, user_id: UserId, pattern: str):
    statement = select(Post).where(
        _chapter_scope(db, user_id, Post.chapter_id, Post.id, ChapterAccessGrantItem.post_id),
        _matches(pattern, Post.body),
    )
    return statement, Post.created_at, Post.id, lambda row: SearchHit(
        type=SearchType.POSTS,
        id=row.id,
        title=_snippet(row.body) or "",
        snippet=None,
        chapter_id=row.chapter_id,
        created_at=row.created_at,
    )


def _events(db: Session, user_id: UserId, pattern: str):
    statement = select(Event).where(
        or_(
            Event.chapter_id.is_(None),
            _chapter_scope(
                db, user_id, Event.chapter_id, Event.id, ChapterAccessGrantItem.event_id
            ),
        ),
        Event.status != EventStatus.CANCELLED.value,
        Event.ends_at > _now(),
        _matches(pattern, Event.title, Event.description, Event.location),
    )
    return statement, Event.created_at, Event.id, lambda row: SearchHit(
        type=SearchType.EVENTS,
        id=row.id,
        title=row.title,
        snippet=_snippet(row.description),
        chapter_id=row.chapter_id,
        starts_at=row.starts_at,
        created_at=row.created_at,
    )


def _resources(db: Session, user_id: UserId, pattern: str):
    statement = select(Resource).where(
        resources.published_and_visible(db, user_id),
        _matches(
            pattern,
            Resource.title,
            Resource.summary,
            Resource.author_name,
            Resource.scripture_reference,
        ),
    )
    return statement, Resource.created_at, Resource.id, lambda row: SearchHit(
        type=SearchType.RESOURCES,
        id=row.id,
        title=row.title,
        snippet=_snippet(row.summary),
        chapter_id=row.chapter_id,
        created_at=row.created_at,
    )


QUERIES: dict[
    SearchType, Callable[[Session, UserId, str], tuple[Select, Any, Any, Callable]]
] = {
    SearchType.CHAPTERS: _chapters,
    SearchType.PEOPLE: _people,
    SearchType.POSTS: _posts,
    SearchType.EVENTS: _events,
    SearchType.RESOURCES: _resources,
}


def search_type(
    db: Session,
    user_id: UserId,
    search: SearchType,
    q: str,
    limit: int,
    cursor: str | None = None,
) -> tuple[list[SearchHit], str | None]:
    """One page of one type's results, newest first."""
    statement, created_col, id_col, to_hit = QUERIES[search](db, user_id, _pattern(q))
    if cursor:
        statement = statement.where(
            pagination.after_cursor(created_col, id_col, cursor, newest_first=True)
        )
    statement = statement.order_by(
        *pagination.order_by(created_col, id_col, newest_first=True)
    ).limit(limit + 1)
    hits = [to_hit(row) for row in db.scalars(statement)]
    if len(hits) <= limit:
        return hits, None
    hits = hits[:limit]
    return hits, pagination.encode_cursor(hits[-1].created_at, hits[-1].id)


def search_all(
    db: Session, user_id: UserId, q: str, limit: int = OVERVIEW_LIMIT
) -> SearchOverview:
    results = {
        search.value: search_type(db, user_id, search, q, limit)[0] for search in SearchType
    }
    return SearchOverview(query=q, **results)
