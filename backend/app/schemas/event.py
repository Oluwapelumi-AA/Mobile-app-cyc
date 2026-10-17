"""Request and response schemas for events and registrations.

``starts_at`` and ``ends_at`` may be sent with a UTC offset
(``2026-11-01T17:00:00Z``) or as a local time without one
(``2026-11-01T18:00:00``), which is read in the event's ``timezone``.
Responses give UTC times plus the same times in the event's time zone.
"""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import (
    AnyUrl,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    UrlConstraints,
)

from app.models.event import EventStatus, RegistrationStatus
from app.schemas.common import UtcDatetime
from app.schemas.locale import TimeZoneId

EventTitle = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=3, max_length=200)
]
EventDescription = Annotated[
    str, StringConstraints(strip_whitespace=True, max_length=5000)
]
EventLocation = Annotated[
    str, StringConstraints(strip_whitespace=True, max_length=300)
]
EventUrl = Annotated[
    AnyUrl, UrlConstraints(max_length=500, allowed_schemes=["http", "https"])
]
Capacity = Annotated[int, Field(ge=1, le=100_000)]


class EventCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Leave out for an app-wide event (platform moderators and admins only).
    community_id: UUID | None = None
    title: EventTitle
    description: EventDescription | None = None
    location: EventLocation | None = None
    online_url: EventUrl | None = None
    starts_at: datetime
    ends_at: datetime
    timezone: TimeZoneId
    capacity: Capacity | None = None


class EventUpdate(BaseModel):
    """Only the fields sent change. ``capacity: null`` removes the limit.

    Changing ``timezone`` alone keeps the same moment in time; send
    ``starts_at`` and ``ends_at`` with it to move the event.
    """

    model_config = ConfigDict(extra="forbid")

    title: EventTitle | None = None
    description: EventDescription | None = None
    location: EventLocation | None = None
    online_url: EventUrl | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    timezone: TimeZoneId | None = None
    capacity: Capacity | None = None


class EventRead(BaseModel):
    id: UUID
    community_id: UUID | None
    created_by: UUID | None
    title: str
    description: str | None
    location: str | None
    online_url: str | None
    starts_at: UtcDatetime
    ends_at: UtcDatetime
    timezone: str
    # The same moments in the event's time zone, with their UTC offset.
    starts_at_local: datetime
    ends_at_local: datetime
    capacity: int | None
    status: EventStatus
    cancelled_at: UtcDatetime | None
    registered_count: int
    waitlist_count: int
    # Null when there is no capacity limit.
    spots_left: int | None
    my_registration: RegistrationStatus | None
    can_manage: bool
    created_at: UtcDatetime
    updated_at: UtcDatetime


class RegistrationRead(BaseModel):
    event_id: UUID
    user_id: UUID
    status: RegistrationStatus
    # 1 for the next person to get a spot; null unless waitlisted.
    waitlist_position: int | None = None
    attended_at: UtcDatetime | None
    checked_in_by: UUID | None
    created_at: UtcDatetime
    updated_at: UtcDatetime


class AttendanceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    attended: bool
