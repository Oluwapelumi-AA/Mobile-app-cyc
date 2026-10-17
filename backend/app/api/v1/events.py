"""Event, registration and attendance endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_id
from app.core.identity import UserId
from app.db.session import get_db
from app.models.event import RegistrationStatus
from app.schemas.common import Page
from app.schemas.event import (
    AttendanceUpdate,
    EventCreate,
    EventRead,
    EventUpdate,
    RegistrationRead,
)
from app.services import events
from app.services.pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE

router = APIRouter(prefix="/events", tags=["Events"])

CurrentUserId = Annotated[UserId, Depends(get_current_user_id)]
DbSession = Annotated[Session, Depends(get_db)]
Limit = Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)]
Cursor = Annotated[str | None, Query(max_length=200)]


@router.post("", response_model=EventRead, status_code=status.HTTP_201_CREATED)
def create_event(data: EventCreate, user_id: CurrentUserId, db: DbSession):
    return events.create_event(db, user_id, data)


@router.get("", response_model=Page[EventRead])
def list_events(
    user_id: CurrentUserId,
    db: DbSession,
    limit: Limit = DEFAULT_PAGE_SIZE,
    cursor: Cursor = None,
    community_id: UUID | None = None,
    past: bool = False,
    mine: bool = False,
):
    """Upcoming events soonest first, or ``past=true`` for ended events.

    ``community_id`` shows one community's events; ``mine=true`` shows only
    events you signed up for.
    """
    items, next_cursor = events.list_events(
        db, user_id, limit, cursor, community_id=community_id, past=past, mine=mine
    )
    return Page(items=items, next_cursor=next_cursor)


@router.get("/{event_id}", response_model=EventRead)
def get_event(event_id: UUID, user_id: CurrentUserId, db: DbSession):
    return events.get_event(db, user_id, event_id)


@router.patch("/{event_id}", response_model=EventRead)
def update_event(event_id: UUID, data: EventUpdate, user_id: CurrentUserId, db: DbSession):
    return events.update_event(db, user_id, event_id, data)


@router.post("/{event_id}/cancel", response_model=EventRead)
def cancel_event(event_id: UUID, user_id: CurrentUserId, db: DbSession):
    return events.cancel_event(db, user_id, event_id)


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(event_id: UUID, user_id: CurrentUserId, db: DbSession):
    events.delete_event(db, user_id, event_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{event_id}/registrations",
    response_model=RegistrationRead,
    status_code=status.HTTP_201_CREATED,
)
def register(event_id: UUID, user_id: CurrentUserId, db: DbSession):
    """Sign up. When the event is full you join the waitlist instead."""
    return events.register(db, user_id, event_id)


@router.get("/{event_id}/registrations", response_model=Page[RegistrationRead])
def list_registrations(
    event_id: UUID,
    user_id: CurrentUserId,
    db: DbSession,
    limit: Limit = DEFAULT_PAGE_SIZE,
    cursor: Cursor = None,
    status: RegistrationStatus | None = None,
):
    """Everyone signed up, in sign-up order. Organizers only."""
    items, next_cursor = events.list_registrations(db, user_id, event_id, limit, cursor, status)
    return Page(items=items, next_cursor=next_cursor)


@router.get("/{event_id}/registrations/me", response_model=RegistrationRead)
def get_my_registration(event_id: UUID, user_id: CurrentUserId, db: DbSession):
    return events.get_my_registration(db, user_id, event_id)


@router.delete("/{event_id}/registrations/me", status_code=status.HTTP_204_NO_CONTENT)
def cancel_registration(event_id: UUID, user_id: CurrentUserId, db: DbSession):
    events.cancel_registration(db, user_id, event_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/{event_id}/registrations/{attendee_id}/attendance", response_model=RegistrationRead)
def set_attendance(
    event_id: UUID,
    attendee_id: UUID,
    data: AttendanceUpdate,
    user_id: CurrentUserId,
    db: DbSession,
):
    """Mark someone as attended (or undo it). Organizers only."""
    return events.set_attendance(db, user_id, event_id, attendee_id, data.attended)
