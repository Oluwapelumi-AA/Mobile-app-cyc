"""Response schemas for search."""

from enum import Enum
from uuid import UUID

from pydantic import BaseModel

from app.schemas.common import UtcDatetime


class SearchType(str, Enum):
    COMMUNITIES = "communities"
    PEOPLE = "people"
    POSTS = "posts"
    EVENTS = "events"
    RESOURCES = "resources"
    BRANCHES = "branches"


class SearchHit(BaseModel):
    """One result. ``type`` says which screen to open with ``id``."""

    type: SearchType
    id: UUID
    # A community, person, event, resource or branch name, or a post preview.
    title: str
    snippet: str | None
    community_id: UUID | None
    image_url: str | None = None
    # Events only.
    starts_at: UtcDatetime | None = None
    created_at: UtcDatetime


class SearchOverview(BaseModel):
    """The first few results of every type, for a search screen with tabs.

    Use ``GET /search/{type}`` to page through one type.
    """

    query: str
    communities: list[SearchHit]
    people: list[SearchHit]
    posts: list[SearchHit]
    events: list[SearchHit]
    resources: list[SearchHit]
    branches: list[SearchHit]
