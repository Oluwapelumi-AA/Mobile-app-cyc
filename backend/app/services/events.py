"""Events, registrations, capacity and attendance.

- An event either belongs to a community or is app-wide (no community).
- Community moderators and above create and manage their community's events.
  App-wide moderators and admins (``users.account_role``) manage every event
  and are the only ones who create app-wide events.
- Who can see an event follows its community: public or joined communities.
  Hidden events answer 404. App-wide events are visible to every user.
- Registering needs membership of the event's community. Registration closes
  when the event starts or is cancelled.
- When an event is full, new registrations join a waitlist in sign-up order.
  A freed spot (a cancellation or a higher capacity) goes to the next person.
  Capacity cannot drop below the number already registered.
- Organizers mark attendance for registered people from one hour before the
  start.
- Times are stored in UTC. Each event keeps the IANA time zone it was
  scheduled in; a time sent without a UTC offset is read in that zone.
"""

import uuid
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.identity import UserId
from app.models.community import (
    Community,
    CommunityMembership,
    CommunityRole,
    CommunityVisibility,
)
from app.models.event import (
    Event,
    EventRegistration,
    EventStatus,
    RegistrationStatus,
)
from app.schemas.event import (
    EventCreate,
    EventRead,
    EventUpdate,
    RegistrationRead,
)
from app.services import notifications, pagination
from app.services.communities import (
    get_visible_community,
    is_platform_moderator,
    rank,
    require_role,
)
from app.services.errors import Conflict, Forbidden, InvalidInput, NotFound

CHECK_IN_OPENS_BEFORE_START = timedelta(hours=1)

EVENT_NOT_FOUND = NotFound("event_not_found", "Event not found.")
EVENT_CANCELLED = Conflict("event_cancelled", "This event has been cancelled.")
REGISTRATION_CLOSED = Conflict(
    "registration_closed", "Registration closed when the event started."
)
NOT_REGISTERED = NotFound("not_registered", "That user is not registered for this event.")

REGISTERED = RegistrationStatus.REGISTERED.value
WAITLISTED = RegistrationStatus.WAITLISTED.value


def _now() -> datetime:
    return datetime.now(UTC)


def _utc(value: datetime) -> datetime:
    # SQLite drops tzinfo on read; stored values are always UTC.
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def to_utc(value: datetime, timezone: str) -> datetime:
    """Return ``value`` in UTC, reading a time without an offset in ``timezone``.

    A local time that happens twice (clocks going back) means the first one.
    A local time that never happens (clocks going forward) is rejected.
    """
    if value.tzinfo is not None:
        return value.astimezone(UTC)
    zone = ZoneInfo(timezone)
    resolved = value.replace(tzinfo=zone).astimezone(UTC)
    if resolved.astimezone(zone).replace(tzinfo=None) != value:
        raise InvalidInput(
            "nonexistent_local_time",
            f"{value.isoformat()} does not exist in {timezone} (the clocks skip it).",
        )
    return resolved


def _check_schedule(starts_at: datetime, ends_at: datetime) -> None:
    if ends_at <= starts_at:
        raise InvalidInput("ends_before_start", "The event must end after it starts.")


def _check_in_future(starts_at: datetime) -> None:
    if starts_at <= _now():
        raise InvalidInput("starts_in_past", "The event must start in the future.")


# Access


def _visible_event(
    db: Session, user_id: UserId, event_id: uuid.UUID
) -> tuple[Event, CommunityMembership | None]:
    event = db.get(Event, event_id)
    if event is None:
        raise EVENT_NOT_FOUND
    if event.community_id is None:
        return event, None
    try:
        _, membership = get_visible_community(db, event.community_id, user_id)
    except NotFound:
        raise EVENT_NOT_FOUND from None
    return event, membership


def visible_event(
    db: Session, user_id: UserId, event_id: uuid.UUID
) -> tuple[Event, CommunityMembership | None]:
    """The event and the user's membership, or 404 if they can't see it."""
    return _visible_event(db, user_id, event_id)


def _can_manage(
    event_community_id: uuid.UUID | None,
    membership_role: str | None,
    platform_moderator: bool,
) -> bool:
    if platform_moderator:
        return True
    return event_community_id is not None and rank(membership_role) >= rank(
        CommunityRole.MODERATOR
    )


def _require_manage(
    db: Session, user_id: UserId, event: Event, membership: CommunityMembership | None
) -> None:
    if is_platform_moderator(db, user_id):
        return
    if event.community_id is None:
        raise Forbidden(
            "insufficient_role", "Only app moderators and admins manage app-wide events."
        )
    require_role(membership, CommunityRole.MODERATOR)


def _lock_event(db: Session, event_id: uuid.UUID) -> Event:
    """Reload the event and lock its row until commit.

    Registrations for one event then run one at a time, so two people can't
    both take the last spot. SQLite ignores the lock (it locks the whole
    database on write instead).
    """
    return db.scalars(
        select(Event)
        .where(Event.id == event_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).one()


# Reading


def _registration_counts(
    db: Session, event_ids: list[uuid.UUID]
) -> dict[uuid.UUID, dict[str, int]]:
    counts: dict[uuid.UUID, dict[str, int]] = {}
    if not event_ids:
        return counts
    rows = db.execute(
        select(EventRegistration.event_id, EventRegistration.status, func.count())
        .where(EventRegistration.event_id.in_(event_ids))
        .group_by(EventRegistration.event_id, EventRegistration.status)
    )
    for event_id, status, count in rows:
        counts.setdefault(event_id, {})[status] = count
    return counts


def _to_read(
    event: Event,
    counts: dict[str, int],
    my_status: str | None,
    can_manage: bool,
) -> EventRead:
    zone = ZoneInfo(event.timezone)
    starts_at, ends_at = _utc(event.starts_at), _utc(event.ends_at)
    registered = counts.get(REGISTERED, 0)
    return EventRead.model_validate(
        {
            "id": event.id,
            "community_id": event.community_id,
            "created_by": event.created_by,
            "title": event.title,
            "description": event.description,
            "location": event.location,
            "online_url": event.online_url,
            "starts_at": starts_at,
            "ends_at": ends_at,
            "timezone": event.timezone,
            "starts_at_local": starts_at.astimezone(zone),
            "ends_at_local": ends_at.astimezone(zone),
            "capacity": event.capacity,
            "status": event.status,
            "cancelled_at": event.cancelled_at,
            "registered_count": registered,
            "waitlist_count": counts.get(WAITLISTED, 0),
            "spots_left": None
            if event.capacity is None
            else max(event.capacity - registered, 0),
            "my_registration": my_status,
            "can_manage": can_manage,
            "created_at": event.created_at,
            "updated_at": event.updated_at,
        }
    )


def _get_registration(
    db: Session, event_id: uuid.UUID, user_id: UserId
) -> EventRegistration | None:
    return db.scalar(
        select(EventRegistration).where(
            EventRegistration.event_id == event_id,
            EventRegistration.user_id == user_id,
        )
    )


def event_read(
    db: Session, user_id: UserId, event: Event, membership: CommunityMembership | None
) -> EventRead:
    registration = _get_registration(db, event.id, user_id)
    return _to_read(
        event,
        _registration_counts(db, [event.id]).get(event.id, {}),
        registration.status if registration else None,
        _can_manage(
            event.community_id,
            membership.role if membership else None,
            is_platform_moderator(db, user_id),
        ),
    )


def get_event(db: Session, user_id: UserId, event_id: uuid.UUID) -> EventRead:
    event, membership = _visible_event(db, user_id, event_id)
    return event_read(db, user_id, event, membership)


def list_events(
    db: Session,
    user_id: UserId,
    limit: int,
    cursor: str | None,
    *,
    community_id: uuid.UUID | None = None,
    past: bool = False,
    mine: bool = False,
) -> tuple[list[EventRead], str | None]:
    """Events the user can see.

    By default upcoming and ongoing events, soonest first. With ``past``,
    events that have ended, most recent first. ``community_id`` limits the
    list to one community and ``mine`` to events the user signed up for
    (registered or waitlisted). Cancelled events are included with their
    status.
    """
    my_communities = select(CommunityMembership.community_id).where(
        CommunityMembership.user_id == user_id
    )
    public_communities = select(Community.id).where(
        Community.visibility == CommunityVisibility.PUBLIC.value
    )
    statement = select(Event)
    if community_id is not None:
        get_visible_community(db, community_id, user_id)
        statement = statement.where(Event.community_id == community_id)
    else:
        statement = statement.where(
            or_(
                Event.community_id.is_(None),
                Event.community_id.in_(public_communities),
                Event.community_id.in_(my_communities),
            )
        )
    if mine:
        statement = statement.where(
            Event.id.in_(
                select(EventRegistration.event_id).where(EventRegistration.user_id == user_id)
            )
        )
    now = _now()
    statement = statement.where(Event.ends_at <= now if past else Event.ends_at > now)
    if cursor:
        statement = statement.where(
            pagination.after_cursor(Event.starts_at, Event.id, cursor, newest_first=past)
        )
    statement = statement.order_by(
        *pagination.order_by(Event.starts_at, Event.id, newest_first=past)
    ).limit(limit + 1)

    rows, next_cursor = pagination.split_page(
        list(db.scalars(statement)), limit, created_attr="starts_at"
    )
    ids = [row.id for row in rows]
    counts = _registration_counts(db, ids)
    my_statuses = (
        dict(
            db.execute(
                select(EventRegistration.event_id, EventRegistration.status).where(
                    EventRegistration.user_id == user_id,
                    EventRegistration.event_id.in_(ids),
                )
            ).all()
        )
        if ids
        else {}
    )
    community_ids = {row.community_id for row in rows if row.community_id is not None}
    my_roles = (
        dict(
            db.execute(
                select(CommunityMembership.community_id, CommunityMembership.role).where(
                    CommunityMembership.user_id == user_id,
                    CommunityMembership.community_id.in_(community_ids),
                )
            ).all()
        )
        if community_ids
        else {}
    )
    platform_moderator = is_platform_moderator(db, user_id)
    items = [
        _to_read(
            row,
            counts.get(row.id, {}),
            my_statuses.get(row.id),
            _can_manage(row.community_id, my_roles.get(row.community_id), platform_moderator),
        )
        for row in rows
    ]
    return items, next_cursor


# Managing events


def create_event(db: Session, user_id: UserId, data: EventCreate) -> EventRead:
    membership = None
    if data.community_id is not None:
        _, membership = get_visible_community(db, data.community_id, user_id)
        if not is_platform_moderator(db, user_id):
            require_role(membership, CommunityRole.MODERATOR)
    elif not is_platform_moderator(db, user_id):
        raise Forbidden(
            "insufficient_role", "Only app moderators and admins create app-wide events."
        )

    starts_at = to_utc(data.starts_at, data.timezone)
    ends_at = to_utc(data.ends_at, data.timezone)
    _check_schedule(starts_at, ends_at)
    _check_in_future(starts_at)

    event = Event(
        community_id=data.community_id,
        created_by=user_id,
        title=data.title,
        description=data.description or None,
        location=data.location or None,
        online_url=str(data.online_url) if data.online_url else None,
        starts_at=starts_at,
        ends_at=ends_at,
        timezone=data.timezone,
        capacity=data.capacity,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return _to_read(event, {}, None, True)


def update_event(
    db: Session, user_id: UserId, event_id: uuid.UUID, data: EventUpdate
) -> EventRead:
    event, membership = _visible_event(db, user_id, event_id)
    _require_manage(db, user_id, event, membership)
    event = _lock_event(db, event.id)
    if event.status == EventStatus.CANCELLED.value:
        raise EVENT_CANCELLED

    changes = data.model_dump(exclude_unset=True)
    for required in ("title", "starts_at", "ends_at", "timezone"):
        if changes.get(required) is None:
            changes.pop(required, None)

    timezone = changes.get("timezone", event.timezone)
    starts_at = (
        to_utc(changes["starts_at"], timezone) if "starts_at" in changes else _utc(event.starts_at)
    )
    ends_at = to_utc(changes["ends_at"], timezone) if "ends_at" in changes else _utc(event.ends_at)
    _check_schedule(starts_at, ends_at)
    if "starts_at" in changes and starts_at != _utc(event.starts_at):
        _check_in_future(starts_at)

    if "capacity" in changes and changes["capacity"] is not None:
        registered = _registration_counts(db, [event.id]).get(event.id, {}).get(REGISTERED, 0)
        if changes["capacity"] < registered:
            raise Conflict(
                "capacity_below_registered",
                f"{registered} people are already registered. "
                "Capacity can't be lower than that.",
            )

    event.title = changes.get("title", event.title)
    for name in ("description", "location"):
        if name in changes:
            setattr(event, name, changes[name] or None)
    if "online_url" in changes:
        event.online_url = str(changes["online_url"]) if changes["online_url"] else None
    rescheduled = starts_at != _utc(event.starts_at)
    event.starts_at, event.ends_at, event.timezone = starts_at, ends_at, timezone
    if "capacity" in changes:
        event.capacity = changes["capacity"]
        promoted = _fill_open_spots(db, event)
        notifications.event_spots_confirmed(db, event, promoted)
    if rescheduled:
        notifications.event_rescheduled(db, event, user_id)
    db.commit()
    db.refresh(event)
    return event_read(db, user_id, event, membership)


def cancel_event(db: Session, user_id: UserId, event_id: uuid.UUID) -> EventRead:
    """Mark the event cancelled. Registrations are kept so people can see it."""
    event, membership = _visible_event(db, user_id, event_id)
    _require_manage(db, user_id, event, membership)
    if event.status == EventStatus.CANCELLED.value:
        raise EVENT_CANCELLED
    event.status = EventStatus.CANCELLED.value
    event.cancelled_at = _now()
    notifications.event_cancelled(db, event, user_id)
    db.commit()
    db.refresh(event)
    return event_read(db, user_id, event, membership)


def delete_event(db: Session, user_id: UserId, event_id: uuid.UUID) -> None:
    event, membership = _visible_event(db, user_id, event_id)
    _require_manage(db, user_id, event, membership)
    db.execute(
        EventRegistration.__table__.delete().where(EventRegistration.event_id == event.id)
    )
    db.delete(event)
    db.commit()


# Registrations


def _waitlist_positions(db: Session, event_id: uuid.UUID) -> dict[UserId, int]:
    user_ids = db.scalars(
        select(EventRegistration.user_id)
        .where(
            EventRegistration.event_id == event_id,
            EventRegistration.status == WAITLISTED,
        )
        .order_by(EventRegistration.created_at, EventRegistration.id)
    )
    return {user: position for position, user in enumerate(user_ids, start=1)}


def _registration_read(
    registration: EventRegistration, positions: dict[UserId, int]
) -> RegistrationRead:
    return RegistrationRead.model_validate(
        {
            "event_id": registration.event_id,
            "user_id": registration.user_id,
            "status": registration.status,
            "waitlist_position": positions.get(registration.user_id)
            if registration.status == WAITLISTED
            else None,
            "attended_at": registration.attended_at,
            "checked_in_by": registration.checked_in_by,
            "created_at": registration.created_at,
            "updated_at": registration.updated_at,
        }
    )


def _fill_open_spots(db: Session, event: Event) -> list[UserId]:
    """Move people from the waitlist into free spots, oldest first. No commit.

    Returns who got a spot."""
    db.flush()
    waitlist = select(EventRegistration).where(
        EventRegistration.event_id == event.id,
        EventRegistration.status == WAITLISTED,
    ).order_by(EventRegistration.created_at, EventRegistration.id)
    if event.capacity is not None:
        registered = _registration_counts(db, [event.id]).get(event.id, {}).get(REGISTERED, 0)
        free = event.capacity - registered
        if free <= 0:
            return []
        waitlist = waitlist.limit(free)
    promoted = []
    for registration in db.scalars(waitlist):
        registration.status = REGISTERED
        promoted.append(registration.user_id)
    return promoted


def _ensure_open(event: Event) -> None:
    if event.status == EventStatus.CANCELLED.value:
        raise EVENT_CANCELLED
    if _utc(event.starts_at) <= _now():
        raise REGISTRATION_CLOSED


def register(db: Session, user_id: UserId, event_id: uuid.UUID) -> RegistrationRead:
    """Sign the user up, or put them on the waitlist when the event is full."""
    event, membership = _visible_event(db, user_id, event_id)
    if event.community_id is not None:
        require_role(membership, CommunityRole.MEMBER)
    event = _lock_event(db, event.id)
    _ensure_open(event)
    already = Conflict("already_registered", "You have already signed up for this event.")
    if _get_registration(db, event.id, user_id) is not None:
        raise already

    registered = _registration_counts(db, [event.id]).get(event.id, {}).get(REGISTERED, 0)
    full = event.capacity is not None and registered >= event.capacity
    registration = EventRegistration(
        event_id=event.id,
        user_id=user_id,
        status=WAITLISTED if full else REGISTERED,
    )
    db.add(registration)
    try:
        db.commit()
    except IntegrityError:
        # Two sign-ups from the same user raced; the other one won.
        db.rollback()
        raise already from None
    db.refresh(registration)
    return _registration_read(registration, _waitlist_positions(db, event.id))


def get_my_registration(
    db: Session, user_id: UserId, event_id: uuid.UUID
) -> RegistrationRead:
    event, _ = _visible_event(db, user_id, event_id)
    registration = _get_registration(db, event.id, user_id)
    if registration is None:
        raise NotFound("not_registered", "You have not signed up for this event.")
    return _registration_read(registration, _waitlist_positions(db, event.id))


def cancel_registration(db: Session, user_id: UserId, event_id: uuid.UUID) -> None:
    """Withdraw the user's sign-up. A freed spot goes to the waitlist."""
    event, _ = _visible_event(db, user_id, event_id)
    event = _lock_event(db, event.id)
    registration = _get_registration(db, event.id, user_id)
    if registration is None:
        raise NotFound("not_registered", "You have not signed up for this event.")
    if _utc(event.starts_at) <= _now():
        raise Conflict(
            "registration_closed", "The event has started, so sign-ups can't be changed."
        )
    db.delete(registration)
    if event.status == EventStatus.SCHEDULED.value:
        promoted = _fill_open_spots(db, event)
        notifications.event_spots_confirmed(db, event, promoted)
    db.commit()


def list_registrations(
    db: Session,
    user_id: UserId,
    event_id: uuid.UUID,
    limit: int,
    cursor: str | None,
    status: RegistrationStatus | None = None,
) -> tuple[list[RegistrationRead], str | None]:
    """Everyone signed up, in sign-up order. Organizers only."""
    event, membership = _visible_event(db, user_id, event_id)
    _require_manage(db, user_id, event, membership)
    statement = select(EventRegistration).where(EventRegistration.event_id == event.id)
    if status is not None:
        statement = statement.where(EventRegistration.status == status.value)
    if cursor:
        statement = statement.where(
            pagination.after_cursor(
                EventRegistration.created_at, EventRegistration.id, cursor, newest_first=False
            )
        )
    statement = statement.order_by(
        *pagination.order_by(EventRegistration.created_at, EventRegistration.id, newest_first=False)
    ).limit(limit + 1)
    rows, next_cursor = pagination.split_page(list(db.scalars(statement)), limit)
    positions = _waitlist_positions(db, event.id)
    return [_registration_read(row, positions) for row in rows], next_cursor


def set_attendance(
    db: Session,
    user_id: UserId,
    event_id: uuid.UUID,
    attendee_id: UserId,
    attended: bool,
) -> RegistrationRead:
    """Mark a registered person as attended, or undo it. Organizers only."""
    event, membership = _visible_event(db, user_id, event_id)
    _require_manage(db, user_id, event, membership)
    if event.status == EventStatus.CANCELLED.value:
        raise EVENT_CANCELLED
    if _now() < _utc(event.starts_at) - CHECK_IN_OPENS_BEFORE_START:
        raise Conflict(
            "check_in_not_open", "Attendance can be marked from one hour before the start."
        )
    registration = _get_registration(db, event.id, attendee_id)
    if registration is None:
        raise NOT_REGISTERED
    if registration.status != REGISTERED:
        raise Conflict(
            "not_confirmed", "That user is on the waitlist and doesn't have a spot."
        )
    if attended:
        if registration.attended_at is None:
            registration.attended_at = _now()
            registration.checked_in_by = user_id
    else:
        registration.attended_at = None
        registration.checked_in_by = None
    db.commit()
    db.refresh(registration)
    return _registration_read(registration, {})
