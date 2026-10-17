"""Shared schema types for list endpoints and timestamps."""

from datetime import UTC, datetime
from typing import Annotated, Generic, TypeVar

from pydantic import AfterValidator, BaseModel


def _ensure_utc(value: datetime) -> datetime:
    # SQLite drops tzinfo on read; stored values are always UTC.
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


UtcDatetime = Annotated[datetime, AfterValidator(_ensure_utc)]

ItemT = TypeVar("ItemT")


class Page(BaseModel, Generic[ItemT]):
    """One page of a cursor-paginated list.

    Pass ``next_cursor`` back as ``cursor`` to get the next page; it is null on
    the last page.
    """

    items: list[ItemT]
    next_cursor: str | None = None
