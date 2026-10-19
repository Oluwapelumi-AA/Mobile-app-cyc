"""Search across communities, people, posts, events, resources and branches.

Only what the user could open anyway is found: public communities and their
posts, events and resources, plus private communities the user belongs to;
published resources; upcoming (not cancelled) events; active people and
branches. Matching is a case-insensitive "contains" on names, titles and
text, newest first within each type.

This is plain ``LIKE`` matching. It is fine for a young app; on PostgreSQL,
``pg_trgm`` indexes or full-text search are the next step when tables grow.
"""

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import Select, or_, select
from sqlalchemy.orm import Session

from app.core.identity import UserId
from app.models.branch import Branch
from app.models.community import Community, CommunityMembership, CommunityVisibility
from app.models.event import Event, EventStatus
from app.models.post import Post
from app.models.resource import Resource
from app.models.user import User
from app.models.user_profile import UserProfile
from app.schemas.search import SearchHit, SearchOverview, SearchType
from app.services import pagination, resources

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


def _visible_communities(user_id: UserId):
    """Ids of communities the user can see."""
    return select(Community.id).where(
        or_(
            Community.visibility == CommunityVisibility.PUBLIC.value,
            Community.id.in_(
                select(CommunityMembership.community_id).where(
                    CommunityMembership.user_id == user_id
                )
            ),
        )
    )


# One query per type: (statement, created_at column, id column, row -> hit).


def _communities(user_id: UserId, pattern: str):
    statement = select(Community).where(
        Community.id.in_(_visible_communities(user_id)),
        _matches(pattern, Community.name, Community.description),
    )
    return statement, Community.created_at, Community.id, lambda row: SearchHit(
        type=SearchType.COMMUNITIES,
        id=row.id,
        title=row.name,
        snippet=_snippet(row.description),
        community_id=row.id,
        created_at=row.created_at,
    )


def _people(user_id: UserId, pattern: str):
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
        community_id=None,
        image_url=row.avatar_url,
        created_at=row.created_at,
    )


def _posts(user_id: UserId, pattern: str):
    statement = select(Post).where(
        Post.community_id.in_(_visible_communities(user_id)),
        _matches(pattern, Post.body),
    )
    return statement, Post.created_at, Post.id, lambda row: SearchHit(
        type=SearchType.POSTS,
        id=row.id,
        title=_snippet(row.body) or "",
        snippet=None,
        community_id=row.community_id,
        created_at=row.created_at,
    )


def _events(user_id: UserId, pattern: str):
    statement = select(Event).where(
        or_(
            Event.community_id.is_(None),
            Event.community_id.in_(_visible_communities(user_id)),
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
        community_id=row.community_id,
        starts_at=row.starts_at,
        created_at=row.created_at,
    )


def _resources(user_id: UserId, pattern: str):
    statement = select(Resource).where(
        resources.published_and_visible(user_id),
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
        community_id=row.community_id,
        created_at=row.created_at,
    )


def _branches(user_id: UserId, pattern: str):
    statement = select(Branch).where(
        Branch.is_active.is_(True),
        _matches(pattern, Branch.name, Branch.city, Branch.description),
    )
    return statement, Branch.created_at, Branch.id, lambda row: SearchHit(
        type=SearchType.BRANCHES,
        id=row.id,
        title=row.name,
        snippet=_snippet(row.city or row.description),
        community_id=None,
        created_at=row.created_at,
    )


QUERIES: dict[SearchType, Callable[[UserId, str], tuple[Select, Any, Any, Callable]]] = {
    SearchType.COMMUNITIES: _communities,
    SearchType.PEOPLE: _people,
    SearchType.POSTS: _posts,
    SearchType.EVENTS: _events,
    SearchType.RESOURCES: _resources,
    SearchType.BRANCHES: _branches,
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
    statement, created_col, id_col, to_hit = QUERIES[search](user_id, _pattern(q))
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
