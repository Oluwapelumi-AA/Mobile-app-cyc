"""The audit log: who did what, for moderation and admin actions.

Services call ``record`` before they commit, so the entry is saved with the
action itself. Entries are never edited or deleted through the API.

Actions logged:

- ``report.actioned``, ``report.dismissed``
- ``post.removed``, ``comment.removed`` (by someone other than the author)
- ``member.banned``, ``member.unbanned``, ``member.removed``
- ``chapter_staff.assigned``, ``chapter_staff.removed``
- ``user.suspended``, ``user.reinstated``, ``user.role_changed``
- ``chapter.created``, ``chapter.updated``, ``chapter.archived``,
  ``chapter.restored``

Who can read it: app moderators and admins read everything; a Chapter's
Moderators and Coordinator read their own Chapter's entries.
"""

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.identity import UserId
from app.models.moderation import AuditLog
from app.schemas.moderation import AuditLogRead
from app.services import pagination
from app.services.errors import Forbidden


def record(
    db: Session,
    actor_id: UserId | None,
    action: str,
    target_type: str,
    target_id: uuid.UUID,
    *,
    chapter_id: uuid.UUID | None = None,
    data: dict | None = None,
) -> AuditLog:
    """Add an audit entry. Does not commit."""
    entry = AuditLog(
        actor_id=actor_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        chapter_id=chapter_id,
        data={key: _jsonable(value) for key, value in (data or {}).items()},
    )
    db.add(entry)
    return entry


def _jsonable(value):
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if hasattr(value, "value"):
        return value.value
    return value


def list_entries(
    db: Session,
    user_id: UserId,
    limit: int,
    cursor: str | None,
    *,
    chapter_id: uuid.UUID | None = None,
    actor_id: uuid.UUID | None = None,
    action: str | None = None,
    target_type: str | None = None,
    target_id: uuid.UUID | None = None,
) -> tuple[list[AuditLogRead], str | None]:
    """Audit entries, newest first."""
    from app.services import chapter_access

    if not chapter_access.is_platform_moderator(db, user_id):
        if chapter_id is None:
            raise Forbidden(
                "insufficient_role",
                "Only app moderators and admins see the whole audit log. "
                "Pass chapter_id to see a Chapter's.",
            )
        chapter_access.require_moderate(db, user_id, chapter_id)

    statement = select(AuditLog)
    if chapter_id is not None:
        statement = statement.where(AuditLog.chapter_id == chapter_id)
    if actor_id is not None:
        statement = statement.where(AuditLog.actor_id == actor_id)
    if action:
        statement = statement.where(AuditLog.action == action)
    if target_type:
        statement = statement.where(AuditLog.target_type == target_type)
    if target_id is not None:
        statement = statement.where(AuditLog.target_id == target_id)
    if cursor:
        statement = statement.where(
            pagination.after_cursor(AuditLog.created_at, AuditLog.id, cursor, newest_first=True)
        )
    statement = statement.order_by(
        *pagination.order_by(AuditLog.created_at, AuditLog.id, newest_first=True)
    ).limit(limit + 1)
    rows, next_cursor = pagination.split_page(list(db.scalars(statement)), limit)
    return [AuditLogRead.model_validate(row, from_attributes=True) for row in rows], next_cursor
