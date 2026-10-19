"""Request and response schemas for meetings, livestreams and replays."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.models.meeting import MeetingKind, MeetingStatus, RecordingStatus
from app.schemas.common import UtcDatetime
from app.services.video_provider import ParticipantRole

MeetingTitle = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=3, max_length=200)
]
MeetingDescription = Annotated[
    str, StringConstraints(strip_whitespace=True, max_length=5000)
]


class MeetingCreate(BaseModel):
    """Leave out ``community_id`` and ``event_id`` for an app-wide meeting.

    With ``event_id`` the meeting belongs to that event's community, so
    ``community_id`` can be left out (if sent it must match).
    """

    model_config = ConfigDict(extra="forbid")

    kind: MeetingKind = MeetingKind.MEETING
    title: MeetingTitle
    description: MeetingDescription | None = None
    community_id: UUID | None = None
    event_id: UUID | None = None
    # Defaults to the event's start time when linked to an event.
    scheduled_start_at: datetime | None = None
    recording_enabled: bool = False


class MeetingUpdate(BaseModel):
    """Only the fields sent change. ``recording_enabled`` applies the next
    time the meeting goes live."""

    model_config = ConfigDict(extra="forbid")

    title: MeetingTitle | None = None
    description: MeetingDescription | None = None
    scheduled_start_at: datetime | None = None
    recording_enabled: bool | None = None


class MeetingRead(BaseModel):
    id: UUID
    kind: MeetingKind
    community_id: UUID | None
    event_id: UUID | None
    created_by: UUID | None
    title: str
    description: str | None
    status: MeetingStatus
    scheduled_start_at: UtcDatetime | None
    recording_enabled: bool
    started_at: UtcDatetime | None
    ended_at: UtcDatetime | None
    can_host: bool
    # Whether you may ask for a join token once it is live.
    can_join: bool
    created_at: UtcDatetime
    updated_at: UtcDatetime


class JoinTokenRead(BaseModel):
    """Pass ``token`` and ``server_url`` to the video SDK. Ask again after
    ``expires_at`` to rejoin."""

    meeting_id: UUID
    provider: str
    room_id: str
    role: ParticipantRole
    token: str
    server_url: str
    expires_at: UtcDatetime


class RecordingRead(BaseModel):
    id: UUID
    meeting_id: UUID
    status: RecordingStatus
    content_type: str | None
    size_bytes: int | None
    duration_seconds: int | None
    published: bool
    created_at: UtcDatetime
    updated_at: UtcDatetime


class RecordingPlayback(RecordingRead):
    # A short-lived link to the file; ask again when it expires.
    playback_url: str
    playback_expires_at: UtcDatetime


class RecordingUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    published: bool
