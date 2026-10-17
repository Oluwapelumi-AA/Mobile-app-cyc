"""Keyset (cursor) pagination over ``(created_at, id)``.

Cursors are opaque to clients: base64 of the last item's timestamp and id.
Keyset pagination stays stable while new rows are added, unlike offsets.
"""

import base64
import binascii
import json
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import and_, or_

from app.services.errors import InvalidInput

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 50

INVALID_CURSOR = InvalidInput("invalid_cursor", "The page cursor is not valid.")


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def encode_cursor(created_at: datetime, item_id: uuid.UUID) -> str:
    raw = json.dumps([_as_utc(created_at).isoformat(), str(item_id)])
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


def decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        created_at, item_id = json.loads(base64.urlsafe_b64decode(padded))
        return _as_utc(datetime.fromisoformat(created_at)), uuid.UUID(item_id)
    except (binascii.Error, ValueError, TypeError, UnicodeDecodeError):
        raise INVALID_CURSOR from None


def after_cursor(created_col: Any, id_col: Any, cursor: str, newest_first: bool):
    """Return a WHERE clause selecting rows that come after ``cursor``."""
    created_at, item_id = decode_cursor(cursor)
    if newest_first:
        return or_(
            created_col < created_at,
            and_(created_col == created_at, id_col < item_id),
        )
    return or_(
        created_col > created_at,
        and_(created_col == created_at, id_col > item_id),
    )


def order_by(created_col: Any, id_col: Any, newest_first: bool) -> tuple:
    if newest_first:
        return created_col.desc(), id_col.desc()
    return created_col.asc(), id_col.asc()


def split_page(rows: list, limit: int, created_attr: str = "created_at") -> tuple[list, str | None]:
    """Trim a ``limit + 1`` result to ``limit`` rows and build the next cursor."""
    if len(rows) <= limit:
        return rows, None
    rows = rows[:limit]
    last = rows[-1]
    return rows, encode_cursor(getattr(last, created_attr), last.id)
